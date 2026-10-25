"""Repair Gate protocol fixtures. Live semantic evidence is recorded separately."""

import json
import sqlite3

import pytest

from conftest import package, upload
from skill_mng.auditing import engine, freeze_audit, submit_result
from skill_mng.config import write_secret_json
from skill_mng.db import transaction
from skill_mng.registry import register
from skill_mng.repair_packages import bump_version, pack, unpack
from skill_mng.repair_runner import CandidateFiles, NeedsAttention
from skill_mng.repairs import (
    create_repair,
    accept_candidate,
    progress,
    publish,
    review_manifest,
    save_review,
    submit_repair_result,
)
from skill_mng.tasks import Conflict, claim, create_enrollment, create_task, redeem, cancel_task


def setup_repair(client, *, auto=True, selected="all", max_rounds=3):
    root = client.app.state.root
    user = client.get("/api/me").json()
    raw = package(
        extra={
            "scripts/greet.py": b'def greet(name):\n    return {"message": name\n',
            "references/note.md": b"Preserve this file.\n",
        }
    )
    source_package, source_files = unpack(raw)
    source_files["SKILL.md"] += b"\n## Prerequisites\nPython 3.11+, no dependencies.\n"
    raw = pack(source_files)
    version = upload(client, raw).json()["version_id"]
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "repair-fixture")
    create_task(root, user, version, "L1", "static", "source-audit")
    source = claim(root, worker["id"])
    findings = [
        engine().finding("D6-E1", "Syntax incomplete", "scripts/greet.py", 2),
        engine().finding("D4-E2", "Description too short"),
    ]
    report = engine().freeze_result(source, findings, [], False)
    submit_result(root, worker["id"], source["attemptId"], 1, report)
    write_secret_json(
        root / "model-config.json",
        {"base_url": "http://127.0.0.1:1/v1", "model": "fixture", "revision": "fixture", "ready": True},
    )
    ids = [f["id"] for f in findings] if selected == "all" else [findings[0]["id"]]
    body = dict(
        audit_run_id=source["auditRunId"],
        selected_ids=ids,
        target_version="1.0.1",
        allowed_paths=[],
        max_rounds=max_rounds,
        publish_after_review=auto,
        make_current=False,
        idempotency_key="repair",
    )
    task = create_repair(root, user, **body)
    manifest = claim(root, worker["id"])
    return root, user, worker, source, manifest, task, raw, body


def candidate_for(raw):
    _, files = unpack(raw)
    files["SKILL.md"] = bump_version(files["SKILL.md"], "1.0.1").replace(
        b"Synthetic fixture", b"Use when generating a synthetic short greeting for a named person."
    )
    files["scripts/greet.py"] = b'def greet(name):\n    return {"message": name}\n'
    return pack(files)


def freeze_round(root, worker, manifest, number, raw, *, findings=None, scope=True, complete=True):
    accept_candidate(root, worker["id"], manifest["attemptId"], 1, number, raw)
    receipt = progress(root, worker["id"], manifest["attemptId"], 1)["rounds"][-1]
    proof = review_manifest(manifest, receipt, manifest["attemptId"], 1)
    result = freeze_audit(
        proof,
        findings or [],
        list(engine().catalogue()),
        complete,
        scope_satisfied=scope,
        scope_reason="Protocol fixture scope result",
    )
    save_review(root, worker["id"], manifest["attemptId"], 1, number, result)
    return result


def terminal(manifest, state="ready"):
    return {
        **{
            k: manifest[k]
            for k in (
                "taskId",
                "auditRunId",
                "repairRunId",
                "versionId",
                "contentDigest",
                "artifactDigest",
                "attemptId",
                "leaseGeneration",
            )
        },
        "schemaVersion": 1,
        "state": state,
        "reason": "",
    }


def test_publish_atomic_fixed_identity_and_idempotency(client):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    assert create_repair(root, user, **body)["reused"]
    result = freeze_round(root, worker, manifest, 1, candidate_for(raw))
    assert submit_repair_result(root, worker["id"], manifest["attemptId"], 1, terminal(manifest))["saved"]
    assert submit_repair_result(root, worker["id"], manifest["attemptId"], 1, terminal(manifest))["reused"]
    detail = client.get("/api/repairs/" + task["repair_run_id"]).json()
    assert detail["state"] == "published" and detail["published_version_id"] == manifest["plannedVersionId"]
    with transaction(root) as db:
        versions = db.execute("SELECT * FROM versions").fetchall()
        assert len(versions) == 2
        assert db.execute("SELECT current_version_id FROM skills").fetchone()[0] == source["versionId"]
        assert (
            db.execute("SELECT verdict FROM audit_runs WHERE id=?", (source["auditRunId"],)).fetchone()[0]
            == "fail"
        )
        saved = json.loads(
            db.execute(
                "SELECT result_json FROM audit_runs WHERE version_id=?", (manifest["plannedVersionId"],)
            ).fetchone()[0]
        )
        assert (
            saved["versionId"] == manifest["plannedVersionId"]
            and saved["reportDigest"] == result["reportDigest"]
        )
    assert publish(root, user, task["repair_run_id"])["reused"]
    assert client.get("/api/repairs/" + task["repair_run_id"] + "/candidate").content == candidate_for(raw)


def test_candidate_scope_limits_and_version_only_path(client):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client, selected="one")
    good = candidate_for(raw)
    with pytest.raises(PermissionError, match="只授权"):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, good)
    _, files = unpack(raw)
    files["SKILL.md"] = bump_version(files["SKILL.md"], "1.0.1")
    files["scripts/greet.py"] = b'print("fixture")\n'
    files["references/note.md"] = b"changed"
    with pytest.raises(PermissionError, match="超出"):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, pack(files))
    files["references/note.md"] = b"Preserve this file.\n"
    receipt = accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, pack(files))
    assert accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, pack(files))["reused"]
    files["scripts/greet.py"] = b'print("other")\n'
    with pytest.raises(Conflict):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, pack(files))
    with pytest.raises(Conflict):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 2, pack(files))
    assert receipt["id"]


@pytest.mark.parametrize(
    "failure", ["scope", "incomplete", "selected", "new_version", "cancelled", "tampered", "permission"]
)
def test_gate_rejects_unsafe_publication(client, failure):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    findings = (
        [engine().finding("D6-E1", "Still broken", "scripts/greet.py", 2)] if failure == "selected" else []
    )
    freeze_round(
        root,
        worker,
        manifest,
        1,
        candidate_for(raw),
        findings=findings,
        scope=failure != "scope",
        complete=failure != "incomplete",
    )
    if failure == "new_version":
        register(root, user, unpack(package(version="2.0.0"))[0])
    if failure == "cancelled":
        cancel_task(root, task["task_id"], user)
    if failure == "permission":
        with transaction(root, write=True) as db:
            db.execute("UPDATE users SET active=0 WHERE id=?", (user["id"],))
    if failure == "tampered":
        with transaction(root) as db:
            digest = db.execute(
                "SELECT a.digest FROM artifacts a JOIN repair_rounds r ON r.artifact_id=a.id"
            ).fetchone()[0]
        (root / "objects" / (digest + ".zip")).write_bytes(package(name="changed", version="1.0.1"))
    try:
        submit_repair_result(root, worker["id"], manifest["attemptId"], 1, terminal(manifest))
    except (Conflict, ValueError):
        pass
    with transaction(root) as db:
        assert not db.execute("SELECT 1 FROM versions WHERE version='1.0.1'").fetchone()
        assert (
            db.execute("SELECT verdict FROM audit_runs WHERE id=?", (source["auditRunId"],)).fetchone()[0]
            == "fail"
        )


def test_candidate_only_then_publish_and_rollback(client):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client, auto=False)
    freeze_round(root, worker, manifest, 1, candidate_for(raw))
    submit_repair_result(root, worker["id"], manifest["attemptId"], 1, terminal(manifest))
    with transaction(root, write=True) as db:
        assert db.execute("SELECT count(*) FROM versions").fetchone()[0] == 1
        db.execute(
            "CREATE TRIGGER block_publish BEFORE INSERT ON versions BEGIN SELECT RAISE(ABORT,'synthetic publish failure'); END"
        )
    with pytest.raises(sqlite3.IntegrityError):
        publish(root, user, task["repair_run_id"])
    with transaction(root, write=True) as db:
        assert db.execute("SELECT count(*) FROM versions").fetchone()[0] == 1
        assert db.execute("SELECT state FROM repair_runs").fetchone()[0] == "ready"
        db.execute("DROP TRIGGER block_publish")
    assert not publish(root, user, task["repair_run_id"])["reused"]
    assert publish(root, user, task["repair_run_id"])["reused"]


def test_max_rounds_and_immutable_review(client):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    candidate = candidate_for(raw)
    for number in range(1, 4):
        report = freeze_round(
            root,
            worker,
            manifest,
            number,
            candidate,
            findings=[engine().finding("D6-E1", "Unresolved", "scripts/greet.py", 2)],
        )
        assert save_review(root, worker["id"], manifest["attemptId"], 1, number, report)["reused"]
        with pytest.raises(ValueError):
            save_review(root, worker["id"], manifest["attemptId"], 1, number, {**report, "score": 0})
    with pytest.raises(Conflict):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 4, candidate)
    submit_repair_result(root, worker["id"], manifest["attemptId"], 1, terminal(manifest, "needs_attention"))
    assert client.get("/api/repairs/" + task["repair_run_id"]).json()["state"] == "needs_attention"


def test_candidate_tool_boundaries_and_concurrent_digest(client):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    _, files = unpack(raw)
    files["SKILL.md"] = bump_version(files["SKILL.md"], "1.0.1")
    target = CandidateFiles(files, manifest)
    read = target.tool("read_file", {"path": "scripts/greet.py", "offset": 0, "limit": 12000})
    assert target.tool(
        "write_candidate", {"path": "scripts/greet.py", "expected_digest": "stale", "content": "print(1)"}
    )["error"].startswith("digest_conflict")
    assert target.tool(
        "write_candidate",
        {"path": "scripts/greet.py", "expected_digest": read["digest"], "content": "print(1)\n"},
    )["saved"]
    with pytest.raises(NeedsAttention):
        target.tool("write_candidate", {"path": "../escape", "expected_digest": "", "content": "bad"})
    with pytest.raises(NeedsAttention):
        target.tool(
            "delete_candidate",
            {
                "path": "SKILL.md",
                "expected_digest": __import__("hashlib").sha256(files["SKILL.md"]).hexdigest(),
            },
        )
    with pytest.raises(NeedsAttention):
        target.tool("shell", {"path": "SKILL.md"})


def test_runner_real_api_tools_fresh_review_and_frozen_resume(client, tmp_path, monkeypatch):
    from skill_mng.repair_runner import run_repair
    from skill_mng.worker_client import RequestFailure

    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    page = client.get("/api/task-history?kind=repair").json()
    assert [item["id"] for item in page["items"]] == [task["task_id"]]
    assert page["items"][0]["repair_state"] == "editing"
    _, final_files = unpack(candidate_for(raw))
    observed = []

    def completion(config, payload, *, timeout):
        observed.append(payload)
        names = [tool["function"]["name"] for tool in payload.get("tools", [])]
        # Inspect the actual post-redaction wire payload: a canned review alone
        # used to hide evidence erased after the authorization field.
        initial = json.loads(payload["messages"][1]["content"])
        scope = initial.get("editScope") or initial["manifest"]["editScope"]
        assert scope == manifest["authorization"]
        entrypoint = initial.get("entrypoint") or initial["skill"]
        assert "SKILL.md" == entrypoint["path"]
        assert "# Example" in entrypoint["content"]
        assert "Preserve this file." in json.dumps(initial["suppliedEvidence"])
        assert manifest["authorization"]["targetVersion"] in payload["messages"][0]["content"]
        assert not payload["messages"][0]["content"].rstrip().endswith("*")

        def call(name, args, index):
            return {
                "id": "fixture-call-" + str(index),
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(args)},
            }

        if "write_candidate" in names:
            tool_messages = [m for m in payload["messages"] if m["role"] == "tool"]
            if not tool_messages:
                calls = [
                    call("read_file", {"path": p, "offset": 0, "limit": 12000}, i)
                    for i, p in enumerate(("SKILL.md", "scripts/greet.py"))
                ]
            elif len(tool_messages) == 2:
                contents = [json.loads(m["content"]) for m in tool_messages]
                calls = [
                    call(
                        "write_candidate",
                        {
                            "path": record["path"],
                            "expected_digest": record["digest"],
                            "content": final_files[record["path"]].decode(),
                        },
                        i + 10,
                    )
                    for i, record in enumerate(contents)
                ]
            else:
                calls = [
                    call(
                        "finish_edit",
                        {"needsAttention": False, "reason": "Protocol fixture edit complete"},
                        30,
                    )
                ]
            return {"role": "assistant", "tool_calls": calls, "content": None}
        # Editor tool messages must not leak into the independent review context.
        assert not any(
            c.get("function", {}).get("name") in {"write_candidate", "finish_edit"}
            for m in payload["messages"]
            for c in m.get("tool_calls", [])
        )
        if names:
            inventory = json.loads(payload["messages"][1]["content"])["files"]
            return {
                "role": "assistant",
                "tool_calls": [
                    call("read_file", {"path": f["path"], "offset": 0, "limit": 12000}, i + 50)
                    for i, f in enumerate(inventory)
                ],
                "content": None,
            }
        return {
            "role": "assistant",
            "content": json.dumps(
                {
                    "findings": [],
                    "ruleResults": [{"ruleId": rule, "status": "pass"} for rule in engine().catalogue()],
                    "scopeSatisfied": True,
                    "scopeReason": "Protocol fixture verifies only authorized changes.",
                }
            ),
        }

    monkeypatch.setattr("skill_mng.execution_api.completion", completion)

    class Transport:
        def request(self, path, body=None, *, binary=False):
            response = (
                client.get("/api" + path, headers={"Authorization": "Bearer " + worker["credential"]})
                if body is None
                else client.post(
                    "/api" + path, json=body, headers={"Authorization": "Bearer " + worker["credential"]}
                )
            )
            if response.status_code >= 400:
                raise RequestFailure(response.status_code)
            return response.content if binary else response.json()

        def upload(self, path, raw):
            response = client.post(
                "/api" + path,
                content=raw,
                headers={
                    "Authorization": "Bearer " + worker["credential"],
                    "Content-Type": "application/zip",
                },
            )
            assert response.status_code == 200, response.text
            return response.json()

    work = tmp_path / "worker-attempt"
    work.mkdir()
    result = run_repair(manifest, raw, Transport(), work)
    assert result["state"] == "ready"
    count = len(observed)
    assert run_repair(manifest, raw, Transport(), work)["state"] == "ready"
    assert len(observed) == count  # frozen review is reused, never rerun for delivery
    assert submit_repair_result(root, worker["id"], manifest["attemptId"], 1, result)["saved"]
    assert client.get("/api/versions/" + source["versionId"] + "/download").content == raw


def test_repair_authorization_rejects_foreign_user_and_unknown_issue(client):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    with pytest.raises(PermissionError):
        create_repair(
            root, {**user, "id": "foreign", "role": "maintainer"}, **{**body, "idempotency_key": "foreign"}
        )
    response = client.post(
        "/api/repairs", json={**body, "selected_ids": ["not-a-finding"], "idempotency_key": "wrong"}
    )
    assert response.status_code == 400
    cancel_task(root, task["task_id"], user)
    with pytest.raises(Conflict):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, candidate_for(raw))


def test_model_proxy_phase_cannot_skip_frozen_review(client, monkeypatch):
    root, user, worker, source, manifest, task, raw, body = setup_repair(client)
    path = f"/api/worker/attempts/{manifest['attemptId']}/model"
    headers = {"Authorization": "Bearer " + worker["credential"]}
    request = {"generation": 1, "phase": "audit", "round_number": 1, "messages": []}
    assert client.post(path, json=request, headers=headers).status_code == 409
    accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, candidate_for(raw))
    assert (
        client.post(path, json={**request, "phase": "repair", "round_number": 2}, headers=headers).status_code
        == 409
    )
    assert client.post(path, json={**request, "phase": "repair"}, headers=headers).status_code == 409
    with transaction(root) as db:
        assert db.execute("SELECT model_calls FROM tasks WHERE id=?", (task["task_id"],)).fetchone()[0] == 0
    monkeypatch.setattr(
        "skill_mng.execution_api.completion",
        lambda config, payload, *, timeout: {"role": "assistant", "content": "{}"},
    )
    assert client.post(path, json=request, headers=headers).status_code == 200
