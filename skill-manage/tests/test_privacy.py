"""Synthetic privacy regression only. No provider requests or target code execution."""

import hashlib
import json

import pytest

from conftest import package, upload
from skill_mng.auditing import engine, freeze_audit, submit_result, validate_result
from skill_mng.config import write_secret_json
from skill_mng.db import transaction
from skill_mng.privacy import TargetPrivacy, redact, secret_spans
from skill_mng.repair_packages import changes, pack, unpack
from skill_mng.repair_runner import CandidateFiles, NeedsAttention, edit_candidate, run_repair
from skill_mng.repairs import accept_candidate, create_repair, submit_repair_result
from skill_mng.runner import run_audit
from skill_mng.tasks import claim, create_enrollment, create_task, redeem


@pytest.mark.parametrize(
    "text,hidden",
    [
        ('password = "demo1234"', ["demo1234"]),
        ("export TOKEN=synthetic-demo-value-0123456789", ["synthetic-demo-value-0123456789"]),
        ('{"api_key": "synthetic-long-key-0123456789"}', ["synthetic-long-key-0123456789"]),
        ('{"accessToken": "short!"}', ["short!"]),
        ('{"clientSecret": "tiny"}', ["tiny"]),
        ("AWS_ACCESS_KEY_ID=synthetic-id", ["synthetic-id"]),
        ("aws_secret_access_key: synthetic-key", ["synthetic-key"]),
        ("DB_PASSWORD: 'p'", ["p"]),
        ("password=1234 # comment", ["1234"]),
        ('password="含空格的 口令"', ["含空格的 口令"]),
        (
            "password: |\n  synthetic-one\n  synthetic-two\nother: visible\n",
            ["synthetic-one", "synthetic-two"],
        ),
        (
            "config:\n  token: >-\n    synthetic-one\n    synthetic-two\n  other: visible\n",
            ["synthetic-one", "synthetic-two"],
        ),
        ('{"password":\n"multiline-json"}', ["multiline-json"]),
        ('secret = """synthetic-one\nsynthetic-two"""', ["synthetic-one", "synthetic-two"]),
        ('password = "synthetic\\"escape"', ['synthetic\\"escape']),
        ('password="unterminated\nprivate-tail', ["unterminated", "private-tail"]),
        (
            "-----BEGIN RSA PRIVATE KEY-----\r\nsynthetic-body\r\n-----END RSA PRIVATE KEY-----",
            ["synthetic-body"],
        ),
        ("-----BEGIN OPENSSH PRIVATE KEY-----\nsynthetic-body\n", ["synthetic-body"]),
        ('token="YOUR_TOKEN_HERE"', ["YOUR_TOKEN_HERE"]),
        ('TOKEN="$TOKEN_FROM_ENV"', ["$TOKEN_FROM_ENV"]),
        ('{"token": "os.getenv(\'TOKEN\')"}', ["os.getenv('TOKEN')"]),
        ("PASSWORD=>synthetic-symbol-secret", [">synthetic-symbol-secret"]),
        ("password='${LITERAL_PLACEHOLDER}'", ["${LITERAL_PLACEHOLDER}"]),
        ('password=os.getenv("PASSWORD", "synthetic-default")', ["synthetic-default"]),
    ],
)
def test_supported_values_masked_at_equal_offsets(text, hidden):
    masked = redact(text)
    assert secret_spans(text)
    assert len(masked) == len(text)
    assert [i for i, c in enumerate(masked) if c in "\r\n"] == [i for i, c in enumerate(text) if c in "\r\n"]
    for value in hidden:
        assert value not in masked
    if "other: visible" in text:
        assert "other: visible" in masked
    assert redact(masked) == masked


@pytest.mark.parametrize(
    "text",
    [
        'password=""',
        "PASSWORD=\nDEBUG=true\n",
        "token: null",
        "secret = None",
        "TOKEN=${TOKEN_FROM_ENV}",
        'api_key = os.getenv("API_KEY")',
        'password = os.environ["PASSWORD"]',
        'token = os.environ.get("TOKEN")',
        "const accessToken = process.env.ACCESS_TOKEN;",
        "Use a token from your environment.\nNo dependencies.",
    ],
)
def test_empty_values_and_explicit_environment_references_remain_readable(text):
    assert secret_spans(text) == []
    assert redact(text) == text


def audit_setup(client, raw, mode="full", key="privacy-audit"):
    version = upload(client, raw).json()["version_id"]
    root = client.app.state.root
    user = client.get("/api/me").json()
    write_secret_json(root / "model-config.json", {"ready": True, "revision": "fixture"})
    created = create_task(root, user, version, "L1", mode, key)
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "privacy-fixture")
    return root, user, worker, created, claim(root, worker["id"])


class NoModel:
    def request(self, *args, **kwargs):
        pytest.fail("A sensitive target must never call the model or upload a masked candidate")


@pytest.mark.parametrize("value", ["p", "1", "SKILL", "demo1234"])
def test_short_values_do_not_prevent_saving_review_report(client, tmp_path, value):
    raw = package(extra={".env": f'PASSWORD="{value}"\n'.encode()})
    root, _, worker, _, manifest = audit_setup(client, raw)
    report = run_audit(manifest, raw, NoModel(), tmp_path)
    assert report["reviewRequired"]
    assert all(f["file"] in {"SKILL.md", ".env"} for f in report["findings"])
    assert submit_result(root, worker["id"], manifest["attemptId"], 1, report)["saved"]


@pytest.mark.parametrize("mode", ["static", "full"])
def test_sensitive_target_blocks_model_and_saves_frozen_report(client, tmp_path, mode):
    value = "synthetic-hidden-value"
    raw = package(extra={".env": f"TOKEN={value}\n".encode(), "references/note.md": value.encode()})
    root, user, worker, task, manifest = audit_setup(client, raw, mode)
    original_digest = hashlib.sha256(raw).hexdigest()
    result = run_audit(manifest, raw, NoModel(), tmp_path)
    assert result["reviewRequired"] and not result["semanticCompleted"] and result["verdict"] != "pass"
    assert any(
        f["file"] == ".env" and f["ruleId"] == "D5-W3" and f["reviewRequired"] for f in result["findings"]
    )
    assert value not in json.dumps(result)
    assert value not in (tmp_path / "result.json").read_text()
    assert value not in (tmp_path / "report.md").read_text()
    assert validate_result(result, manifest) == result
    receipt = submit_result(root, worker["id"], manifest["attemptId"], 1, result)
    assert receipt["report_digest"] == hashlib.sha256(result["reportMarkdown"].encode()).hexdigest()
    assert submit_result(root, worker["id"], manifest["attemptId"], 1, result)["reused"]
    assert client.get(f"/api/versions/{manifest['versionId']}/download").content == raw
    assert hashlib.sha256(raw).hexdigest() == original_digest
    with transaction(root) as db:
        assert db.execute("SELECT model_calls FROM tasks WHERE id=?", (task["task_id"],)).fetchone()[0] == 0
        assert value not in json.dumps([dict(row) for row in db.execute("SELECT * FROM events")])


def test_web_proxy_independently_blocks_sensitive_package_without_spending_budget(client, monkeypatch):
    raw = package(extra={"config.yaml": b'password: "demo1234"\n'})
    root, _, worker, _, manifest = audit_setup(client, raw)
    monkeypatch.setattr(
        "skill_mng.execution_api.completion", lambda *args, **kwargs: pytest.fail("provider called")
    )
    response = client.post(
        f"/api/worker/attempts/{manifest['attemptId']}/model",
        json={"generation": 1, "messages": [{"role": "user", "content": "Please audit"}]},
        headers={"Authorization": "Bearer " + worker["credential"]},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "target_credentials_require_review"
    assert "demo1234" not in response.text
    with transaction(root) as db:
        assert db.execute("SELECT model_calls FROM tasks").fetchone()[0] == 0


def test_proxy_masks_untrusted_message_literals_before_provider(client, monkeypatch):
    _, _, worker, _, manifest = audit_setup(client, package())
    seen = []

    def completion(config, payload, **kwargs):
        seen.append(payload)
        assert "demo1234" not in json.dumps(payload)
        return {"content": "{}"}

    monkeypatch.setattr("skill_mng.execution_api.completion", completion)
    response = client.post(
        f"/api/worker/attempts/{manifest['attemptId']}/model",
        json={"generation": 1, "messages": [{"role": "user", "content": 'password="demo1234"'}]},
        headers={"Authorization": "Bearer " + worker["credential"]},
    )
    assert response.status_code == 200 and len(seen) == 1


def test_whole_document_scan_and_candidate_slices_preserve_boundaries():
    value = "synthetic-boundary-secret-0123456789"
    source = ("x" * 11980 + '\nTOKEN="' + value + '"\n').encode()
    files = {"SKILL.md": b"unused", "config.txt": source, "references/note.md": value.encode()}
    candidate = CandidateFiles(files, {"authorization": {"editPaths": ["config.txt"]}})
    for path in ("config.txt", "references/note.md"):
        total = len(files[path].decode())
        received = []
        for offset in range(0, total, 12000):
            evidence = candidate.tool("read_file", {"path": path, "offset": offset, "limit": 12000})
            received.append(evidence["content"])
            assert evidence["digest"] == hashlib.sha256(files[path]).hexdigest()
            assert evidence["totalCharacters"] == total
        assert value not in "".join(received)
        assert len("".join(received)) == total
    assert candidate.files == files
    for name in ("write_candidate", "delete_candidate"):
        with pytest.raises(NeedsAttention, match="target_credentials_require_review"):
            candidate.tool(
                name,
                {
                    "path": "config.txt",
                    "expected_digest": hashlib.sha256(source).hexdigest(),
                    "content": redact(source.decode()),
                },
            )


def test_diff_masks_full_multiline_values_and_cross_file_context():
    value = "synthetic-diff-secret"
    before = {"config.env": f"PASSWORD={value}\n".encode(), "note.md": f"{value}\nbefore\n".encode()}
    after = {"note.md": f"{value}\nafter\n".encode(), "config.env": b"PASSWORD=********\n"}
    diff = changes(before, after)
    assert value not in json.dumps(diff)
    assert all(row["beforeDigest"] == hashlib.sha256(before[row["path"]]).hexdigest() for row in diff)
    assert before["config.env"].decode().startswith("PASSWORD=" + value)
    shared = TargetPrivacy({".env": b"TOKEN=synthetic-one; PASSWORD=synthetic-two\n"})
    assert shared.redact("synthetic-one synthetic-two") == "************* *************"
    paths = changes({"SKILL.md": b'TOKEN="SKILL"\n'}, {"SKILL.md": b'TOKEN="OTHER"\n# changed\n'})
    assert paths[0]["path"] == "SKILL.md" and "original/SKILL.md" in paths[0]["diff"]


def test_model_cannot_replace_masks_or_introduce_new_credentials():
    _, files = unpack(package())
    candidate = CandidateFiles(
        files,
        {"skillSlug": "hello-skill", "authorization": {"editPaths": [".env"], "targetVersion": "1.0.0"}},
    )
    with pytest.raises(NeedsAttention, match="target_credentials_require_review"):
        candidate.tool(
            "write_candidate",
            {"path": ".env", "expected_digest": "", "content": 'TOKEN="synthetic-new-value"'},
        )
    assert candidate.files == files


@pytest.mark.parametrize("path", ["large.env", "many.py"])
def test_many_secrets_in_large_file_remain_bounded_and_reviewable(client, tmp_path, path):
    source = b"\n" * 270000 if path == "large.env" else b""
    source += b'TOKEN="synthetic-large-secret"\n' * 600
    raw = package(extra={path: source})
    root, _, worker, _, manifest = audit_setup(client, raw)
    result = run_audit(manifest, raw, NoModel(), tmp_path)
    assert result["reviewRequired"] and len(result["findings"]) <= 451
    assert "synthetic-large-secret" not in json.dumps(result)
    assert submit_result(root, worker["id"], manifest["attemptId"], 1, result)["saved"]


def test_server_rejects_forged_sensitive_pass_and_raw_report(client, tmp_path):
    value = "synthetic-report-secret"
    raw = package(extra={"config.env": f"TOKEN={value}\n".encode()})
    root, _, worker, _, manifest = audit_setup(client, raw)
    forged = freeze_audit(manifest, [], list(engine().catalogue()), True)
    with pytest.raises(ValueError, match="target_credentials_require_review"):
        submit_result(root, worker["id"], manifest["attemptId"], 1, forged)
    safe = run_audit(manifest, raw, NoModel(), tmp_path)
    with pytest.raises(ValueError, match="未声明字段"):
        submit_result(root, worker["id"], manifest["attemptId"], 1, {**safe, "raw_context": value})
    extra_finding = {**safe["findings"][0], "raw_evidence": value}
    extra = engine().freeze_result(manifest, [extra_finding], [], False)
    with pytest.raises(ValueError, match="未声明字段"):
        submit_result(root, worker["id"], manifest["attemptId"], 1, extra)
    leaked = engine().freeze_result(
        manifest, [engine().finding("D5-W3", "Unexpected " + value, review=True)], [], False
    )
    with pytest.raises(ValueError, match="target_credentials_in_report"):
        submit_result(root, worker["id"], manifest["attemptId"], 1, leaked)
    assert submit_result(root, worker["id"], manifest["attemptId"], 1, safe)["saved"]


def test_report_masks_echoes_before_binding_ids_and_digest(client):
    raw = package(extra={"config.env": b"PASSWORD=synthetic-report-secret\n"})
    _, _, _, _, manifest = audit_setup(client, raw)
    finding = engine().finding("D5-W3", "Echo synthetic-report-secret", review=True)
    finding["suggestion"] = 'password="synthetic-new-secret"'
    report = freeze_audit(manifest, [finding], [], False, privacy=TargetPrivacy(unpack(raw)[1]))
    assert "synthetic-report-secret" not in json.dumps(report)
    assert "synthetic-new-secret" not in json.dumps(report)
    assert validate_result(report, manifest) == report


def test_sensitive_repair_stops_before_version_bump_or_upload(client, tmp_path):
    raw = package(extra={".env": b"PASSWORD=synthetic-repair-secret\n"})
    root, user, worker, _, manifest = audit_setup(client, raw, "static")
    audit = run_audit(manifest, raw, NoModel(), tmp_path)
    submit_result(root, worker["id"], manifest["attemptId"], 1, audit)
    selected = next(f["id"] for f in audit["findings"] if not f["reviewRequired"])
    created = create_repair(
        root, user, manifest["auditRunId"], [selected], "1.0.1", [], 1, True, False, "privacy-repair"
    )
    repair_manifest = claim(root, worker["id"])
    result = run_repair(repair_manifest, raw, NoModel(), tmp_path)
    assert result["state"] == "needs_attention" and result["reason"] == "target_credentials_require_review"
    with pytest.raises(NeedsAttention, match="target_credentials_require_review"):
        edit_candidate(repair_manifest, unpack(raw)[1], NoModel(), 1, [])
    assert not (tmp_path / "round-1").exists()
    assert submit_repair_result(root, worker["id"], repair_manifest["attemptId"], 1, result)["saved"]
    detail = client.get("/api/repairs/" + created["repair_run_id"]).json()
    assert detail["state"] == "needs_attention" and not detail["rounds"]


def test_server_rejects_candidate_with_credentials(client):
    from test_repairs import setup_repair, candidate_for

    root, _, worker, _, manifest, _, raw, _ = setup_repair(client)
    _, files = unpack(candidate_for(raw))
    files["scripts/greet.py"] += b'\npassword = "synthetic-candidate-secret"\n'
    with pytest.raises(ValueError, match="target_credentials_require_review"):
        accept_candidate(root, worker["id"], manifest["attemptId"], 1, 1, pack(files))
    with transaction(root) as db:
        assert db.execute("SELECT count(*) FROM repair_rounds").fetchone()[0] == 0
