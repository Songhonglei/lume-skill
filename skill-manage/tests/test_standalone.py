import hashlib
import json
import subprocess
import sys
import threading

from conftest import package, upload
from skill_mng.auditing import SKILL_ROOT, engine
from skill_mng.config import write_secret_json
from skill_mng.packages import inspect_package
from skill_mng.tasks import claim, create_enrollment, create_task, redeem
from skill_mng.worker import execute
from skill_mng.worker_client import RequestFailure


def test_standalone_manifest_identity_semantic_merge_and_errors(tmp_path):
    content = b"---\nname: example\nversion: 1.0.0\ndescription: Use when the user asks for a synthetic greeting in their language.\n---\n# Example\n## Prerequisites\nPython 3.11, no dependencies.\n"
    raw = package(extra={"SKILL.md": content})
    parsed = inspect_package(raw)
    target = tmp_path / "target"
    target.mkdir()
    (target / "SKILL.md").write_bytes(content)
    artifact = tmp_path / "original.zip"
    artifact.write_bytes(raw)
    manifest = {
        "schemaVersion": 1,
        **{k: "a" * 32 for k in ("taskId", "attemptId", "auditRunId", "versionId")},
        "leaseGeneration": 1,
        "depth": "L1",
        "registeredVersion": "1.0.0",
        "contentDigest": parsed.content_digest,
        "artifactDigest": parsed.artifact_digest,
        "ruleVersion": engine().RULE_VERSION,
    }
    m = tmp_path / "manifest.json"
    m.write_text(json.dumps(manifest))
    evidence = tmp_path / "evidence.json"
    evidence.write_text(
        json.dumps({"findings": [], "checkedRuleIds": list(engine().catalogue()), "semanticCompleted": True})
    )

    def run(output, *extra):
        return subprocess.run(
            [
                sys.executable,
                str(SKILL_ROOT / "scripts/audit_package.py"),
                str(target),
                "--manifest",
                str(m),
                "--artifact",
                str(artifact),
                "--output",
                str(output),
                *extra,
            ],
            capture_output=True,
            text=True,
        )

    # Supplied semantic coverage is a protocol fixture, not real model acceptance.
    final = tmp_path / "final"
    result = run(final, "--semantic-result", str(evidence))
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads((final / "result.json").read_text())
    assert (
        report["verdict"] == "pass"
        and report["reportDigest"] == hashlib.sha256((final / "report.md").read_bytes()).hexdigest()
    )
    assert run(final).returncode == 2  # never overwrite a frozen result
    preflight = tmp_path / "preflight"
    assert run(preflight).returncode == 0
    assert json.loads((preflight / "result.json").read_text())["verdict"] == "review_required"
    (target / "SKILL.md").write_bytes(content + b"changed")
    assert run(tmp_path / "mismatch").returncode == 2
    assert not (tmp_path / "mismatch").exists()


def test_frozen_worker_delivery_retries_do_not_rescore(client, tmp_path):
    root = client.app.state.root
    user = client.get("/api/me").json()
    version = upload(client).json()["version_id"]
    create_task(root, user, version, "L1", "static", "frozen")
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "fixture")
    manifest = claim(root, worker["id"])
    result = engine().freeze_result(manifest, [], [], False)
    write_secret_json(tmp_path / "worker/frozen" / f"{manifest['auditRunId']}.json", result)

    class Fixture:
        submits = []

        def request(self, path, body=None, **kwargs):
            if path.endswith("/heartbeat"):
                return {"cancel_requested": False}
            assert path.endswith("/result")  # no package/model call, and no runner spawned
            self.submits.append(body["result"])
            if len(self.submits) == 1:
                raise RequestFailure()
            return {"saved": True, "reused": True}

    fixture = Fixture()
    execute(tmp_path, fixture, manifest, threading.Event())
    assert fixture.submits == [result, result]
    assert json.loads((tmp_path / "worker/frozen" / f"{manifest['auditRunId']}.json").read_text()) == result
