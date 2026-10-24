import json
import concurrent.futures
import hashlib

import pytest

from conftest import upload
from skill_mng.auditing import engine, submit_result
from skill_mng.db import transaction
from skill_mng.tasks import (
    Conflict,
    cancel_task,
    claim,
    create_enrollment,
    create_task,
    heartbeat,
    recover_expired,
    redeem,
    revoke_worker,
    worker_auth,
)


def context(client):
    root = client.app.state.root
    user = client.get("/api/me").json()
    version = upload(client).json()["version_id"]
    return root, user, version


def result_for(manifest, findings=(), complete=False):
    return engine().freeze_result(
        manifest, list(findings), list(engine().catalogue(manifest["depth"])) if complete else [], complete
    )


def test_single_consumer_and_code_expiry(client):
    root, user, _ = context(client)
    enrollment = create_enrollment(root, user["id"])

    def exchange(_):
        try:
            return redeem(root, enrollment["code"], "fixture")
        except PermissionError:
            return None

    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        rows = list(pool.map(exchange, range(4)))
    assert sum(r is not None for r in rows) == 1
    worker = next(r for r in rows if r)
    assert worker_auth(root, worker["credential"])["id"] == worker["id"]
    listed = client.get("/api/worker-enrollments").json()[0]
    assert listed["consumed_at"] and listed["worker_id"] == worker["id"]
    assert "code" not in listed  # Lost reply is visible, consumed code cannot be recovered.
    enrollment = create_enrollment(root, user["id"])
    with transaction(root, write=True) as db:
        db.execute("UPDATE worker_enrollments SET expires_at=0 WHERE id=?", (enrollment["id"],))
    with pytest.raises(PermissionError):
        redeem(root, enrollment["code"], "expired")
    revoke_worker(root, worker["id"], user["id"])
    with pytest.raises(PermissionError):
        worker_auth(root, worker["credential"])


def test_claim_reassignment_late_result_cancel_and_idempotency(client):
    root, user, version = context(client)
    workers = [redeem(root, create_enrollment(root, user["id"])["code"], f"w{i}") for i in range(2)]
    task = create_task(root, user, version, "L1", "static", "one")
    assert create_task(root, user, version, "L1", "static", "one")["reused"]
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        manifests = list(pool.map(lambda w: claim(root, w["id"]), workers))
    assert sum(m is not None for m in manifests) == 1
    idx = next(i for i, m in enumerate(manifests) if m)
    old = manifests[idx]
    with transaction(root, write=True) as db:
        db.execute("UPDATE task_attempts SET lease_until=0")
        recover_expired(db)
        db.execute("UPDATE tasks SET available_at=0")
    new = claim(root, workers[1 - idx]["id"])
    assert new["auditRunId"] == old["auditRunId"] and new["leaseGeneration"] == 2
    with pytest.raises(Conflict):
        submit_result(root, workers[idx]["id"], old["attemptId"], 1, result_for(old))
    assert cancel_task(root, task["task_id"], user)["state"] == "cancelling"
    assert cancel_task(root, task["task_id"], user)["state"] == "cancelling"
    assert heartbeat(root, workers[1 - idx]["id"], new["attemptId"], 2)["cancel_requested"]
    with pytest.raises(Conflict):
        submit_result(root, workers[1 - idx]["id"], new["attemptId"], 2, result_for(new))
    with transaction(root, write=True) as db:
        db.execute("UPDATE task_attempts SET lease_until=0")
        recover_expired(db)
        assert db.execute("SELECT state FROM tasks").fetchone()[0] == "cancelled"


def test_report_atomicity_digest_and_zero_point_err(client):
    root, user, version = context(client)
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "test")
    task = create_task(root, user, version, "L1", "static", "report")
    manifest = claim(root, worker["id"])
    result = result_for(manifest, [engine().finding("D7-E1", "Version differs")])
    assert result["score"] == result["maxScore"] and result["verdict"] == "fail"
    invalid = {**result, "reportMarkdown": "forged"}
    with pytest.raises(ValueError):
        submit_result(root, worker["id"], manifest["attemptId"], 1, invalid)
    with transaction(root) as db:
        assert not db.execute("SELECT 1 FROM findings").fetchone()
        assert db.execute("SELECT result_json FROM audit_runs").fetchone()[0] is None
    import sqlite3

    with transaction(root, write=True) as db:
        db.execute(
            "CREATE TRIGGER synthetic_save_failure BEFORE INSERT ON findings BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END"
        )
    with pytest.raises(sqlite3.IntegrityError):
        submit_result(root, worker["id"], manifest["attemptId"], 1, result)
    with transaction(root, write=True) as db:
        assert db.execute("SELECT result_json FROM audit_runs").fetchone()[0] is None
        assert db.execute("SELECT state FROM tasks").fetchone()[0] == "running"
        db.execute("DROP TRIGGER synthetic_save_failure")
    saved = submit_result(root, worker["id"], manifest["attemptId"], 1, result)
    assert saved["saved"] and not saved["reused"]
    assert submit_result(root, worker["id"], manifest["attemptId"], 1, result)["reused"]
    report = client.get(f"/api/audits/{task['audit_run_id']}").json()["result"]
    raw = client.get(f"/api/audits/{task['audit_run_id']}/report").content
    assert hashlib.sha256(raw).hexdigest() == report["reportDigest"] == result["reportDigest"]
    assert report["repairPrompt"] and report["contentDigest"] == manifest["contentDigest"]
    with pytest.raises(Conflict):
        submit_result(root, worker["id"], manifest["attemptId"], 1, {**result, "score": 0})


def test_waiting_model_worker_auth_and_write_permissions(client):
    root, user, version = context(client)
    task = create_task(root, user, version, "L2", "full", "model")
    assert client.get("/api/tasks").json()[0]["state"] == "waiting_configuration"
    assert client.post("/api/worker/tasks/claim", json={}).status_code == 401
    enrollment = client.post("/api/worker-enrollments").json()
    worker = client.post("/api/worker/enroll", json={"code": enrollment["code"], "name": "test"}).json()
    headers = {"Authorization": "Bearer " + worker["credential"]}
    assert client.post("/api/worker/tasks/claim", json={}, headers=headers).json()["task"] is None
    assert (
        client.post(
            "/api/audits",
            json={"version_id": version, "depth": "L1", "mode": "static", "idempotency_key": "static"},
        ).status_code
        == 200
    )
    manifest = client.post("/api/worker/tasks/claim", json={}, headers=headers).json()["task"]
    url = f"/api/worker/attempts/{manifest['attemptId']}"
    assert (
        client.post(url + "/model", json={"generation": 1, "messages": []}, headers=headers).status_code
        == 403
    )
    assert client.delete("/api/workers/" + worker["id"]).status_code == 200
    assert client.get(url + "/package?generation=1", headers=headers).status_code == 403
    member = {**user, "id": "unrelated", "role": "maintainer"}
    with pytest.raises(PermissionError):
        create_task(root, member, version, "L1", "static", "foreign")
    assert cancel_task(root, task["task_id"], user)["state"] == "cancelled"


def test_rule_scoring_and_static_never_passes():
    audit = engine()
    assert sum(r["points"] for r in audit.catalogue("L1").values()) == 117
    assert sum(r["points"] for r in audit.catalogue("L2").values()) == 120
    rules = list(audit.catalogue("L1"))
    assert audit.evaluate([], "L1", rules, False)["verdict"] == "review_required"
    assert audit.evaluate([], "L1", rules, True)["verdict"] == "pass"
    a = audit.finding("D4-E2", "one")
    b = audit.finding("D4-E2", "two", line=2)
    result = audit.evaluate([a, b], "L1", rules, True)
    assert result["maxScore"] - result["score"] == audit.catalogue()["D4-E2"]["points"]
    assert result["errorCount"] == 2


def test_path_boundaries_and_checker_read_failure(tmp_path):
    import importlib.util
    from skill_mng.auditing import SKILL_ROOT

    spec = importlib.util.spec_from_file_location(
        "path_fixture", SKILL_ROOT / "scripts/check_path_boundary.py"
    )
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)

    def scan(code):
        return checker.scan_sources({"scripts/example.py": code}, tmp_path)

    assert scan("from pathlib import Path\nx=Path(__file__).resolve().parents[2]")["err_count"] == 1
    assert (
        scan('from pathlib import Path\nx=Path(__file__).resolve().parents[1] / "references"')["err_count"]
        == 0
    )
    assert (
        scan("from pathlib import Path\nbase=Path(__file__).resolve().parents[1]\nx=base.parent")["err_count"]
        == 1
    )
    assert scan(
        'from pathlib import Path\nbase=Path(__file__).resolve().parents[1]\nbase=Path("configured")\nx=base.parent'
    )["review_required"]
    assert scan("from pathlib import Path\ndef f(base):\n return base.parent")["review_required"]
    assert scan("from pathlib import Path\nx=Path(__file__).parents[-1]")["review_required"]
    with pytest.raises(ValueError):
        checker.scan_result(tmp_path / "missing")
    (tmp_path / "bad.py").write_text("def broken(")
    with pytest.raises(SyntaxError):
        checker.scan_result(tmp_path)


def test_restore_revokes_execution_and_retains_saved_report(client, tmp_path):
    from skill_mng.backup import backup, restore
    from skill_mng.models import save_model

    root, user, version = context(client)
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "fixture")
    create_task(root, user, version, "L1", "static", "saved")
    manifest = claim(root, worker["id"])
    result = result_for(manifest)
    submit_result(root, worker["id"], manifest["attemptId"], 1, result)
    pending = create_task(root, user, version, "L1", "static", "pending")
    claim(root, worker["id"])
    save_model(root, "http://127.0.0.1:1/v1", "fixture", "synthetic-do-not-backup")
    output = tmp_path.parent / (tmp_path.name + "-backup.zip")
    target = tmp_path.parent / (tmp_path.name + "-restored")
    backup(root, output)
    restore(output, target)
    assert not (target / "model-config.json").exists()
    with pytest.raises(PermissionError):
        worker_auth(target, worker["credential"])
    with transaction(target) as db:
        saved = json.loads(
            db.execute("SELECT result_json FROM audit_runs WHERE id=?", (manifest["auditRunId"],)).fetchone()[
                0
            ]
        )
        assert saved["reportDigest"] == result["reportDigest"]
        assert (
            db.execute("SELECT state FROM tasks WHERE id=?", (pending["task_id"],)).fetchone()[0]
            == "cancelled"
        )
        assert not db.execute("SELECT 1 FROM task_attempts WHERE state IN ('running','leased')").fetchone()
