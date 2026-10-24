"""Real configured-model audit -> repair -> fresh review -> registered version.

This test calls the provided model service. It does not use synthetic model responses
or execute the target package. Keys are read from a 600 file, never CLI values/logs.
"""

import argparse
import hashlib
import http.cookiejar
import io
import json
import re
import secrets
import time
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlsplit


def read_secret_json(path):
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError("Credential/config files must be private regular files (600)")
    return json.loads(path.read_text())


def run(base, credentials, fixture, model=None):
    parsed = urlsplit(base)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Use an HTTP(S) origin without a path or credentials")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None

    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        urllib.request.ProxyHandler({}),
        NoRedirect(),
    )
    csrf = ""

    def api(path, body=None, raw=None, headers=None, binary=False):
        payload = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            base + "/api" + path,
            data=payload,
            headers={"Content-Type": "application/json", "X-CSRF-Token": csrf, **(headers or {})},
        )
        with client.open(request, timeout=110 if path == "/model/probe" else 15) as response:
            return response.read() if binary else json.load(response)

    csrf = api("/login", credentials)["csrf"]
    if model:
        request = urllib.request.Request(
            base + "/api/model",
            data=json.dumps({k: model.get(k, "") for k in ("base_url", "model", "api_key")}).encode(),
            method="PUT",
            headers={"Content-Type": "application/json", "X-CSRF-Token": csrf},
        )
        with client.open(request, timeout=15) as response:
            json.load(response)
        assert api("/model/probe", {})["ready"], "Configured model did not pass capability probe"
    else:
        assert api("/model")["ready"], "Configure the model first"
    cohort = secrets.token_hex(6)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(fixture.rglob("*")):
            if path.is_symlink():
                raise ValueError("Fixture cannot contain symlinks")
            if not path.is_file():
                continue
            content = path.read_bytes()
            if path.name == "SKILL.md":
                content = re.sub(
                    r"^name: .*$", "name: live-repair-" + cohort, content.decode(), flags=re.M
                ).encode()
            archive.writestr(str(path.relative_to(fixture)), content)
    raw = buffer.getvalue()
    boundary = secrets.token_hex(12)
    payload = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.zip"\r\nContent-Type: application/zip\r\n\r\n'.encode()
        + raw
        + f"\r\n--{boundary}--\r\n".encode()
    )
    registered = api(
        "/import/upload", raw=payload, headers={"Content-Type": "multipart/form-data; boundary=" + boundary}
    )
    source = api(
        "/audits",
        {
            "version_id": registered["version_id"],
            "depth": "L1",
            "mode": "full",
            "idempotency_key": "audit-" + cohort,
        },
    )

    def await_task(task_id, seconds):
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            task = api("/tasks/" + task_id)
            if task["state"] in ("succeeded", "failed", "cancelled"):
                return task
            time.sleep(1)
        raise AssertionError("Task exceeded smoke-test deadline")

    audited = await_task(source["task_id"], 330)
    report = api("/audits/" + source["audit_run_id"])["result"]
    assert audited["state"] == "succeeded" and report and report["verdict"] == "fail", json.dumps(
        {
            "phase": "source_audit",
            "state": audited["state"],
            "failure_code": audited["failure_code"],
            "model_calls": audited["model_calls"],
            "verdict": report["verdict"] if report else None,
        }
    )
    selected = [f["id"] for f in report["findings"] if not f["reviewRequired"]]
    assert selected, "Need a confirmed source finding"
    repair = api(
        "/repairs",
        {
            "audit_run_id": source["audit_run_id"],
            "selected_ids": selected,
            "target_version": "1.0.1",
            "max_rounds": 3,
            "publish_after_review": True,
            "make_current": False,
            "idempotency_key": "repair-" + cohort,
        },
    )
    completed = await_task(repair["task_id"], 930)
    result = api("/repairs/" + repair["repair_run_id"])
    assert completed["state"] == "succeeded" and result["state"] == "published", json.dumps(
        {"task_state": completed["state"], "repair_state": result["state"], "reason": result["failure_code"]}
    )
    review = result["rounds"][-1]["review"]
    assert (
        review["verdict"] == "pass"
        and review["semanticCompleted"]
        and not review["reviewRequired"]
        and review["scopeSatisfied"]
    )
    original = api("/versions/" + registered["version_id"] + "/download", binary=True)
    assert original == raw, "Original package changed"
    new = api("/versions/" + result["published_version_id"] + "/download", binary=True)
    final = api("/repairs/" + repair["repair_run_id"] + "/report", binary=True)
    assert hashlib.sha256(new).hexdigest() == result["rounds"][-1]["artifact_digest"]
    assert hashlib.sha256(final).hexdigest() == review["reportDigest"]
    skill = api("/skills/" + registered["skill_id"])
    assert skill["current_version_id"] == registered["version_id"]
    assert api("/repairs/" + repair["repair_run_id"] + "/publish", {})["reused"]
    return {
        "passed": True,
        "skill_id": registered["skill_id"],
        "source_version_id": registered["version_id"],
        "version_id": result["published_version_id"],
        "audit_run_id": source["audit_run_id"],
        "repair_run_id": repair["repair_run_id"],
        "task_id": repair["task_id"],
        "score": review["score"],
        "max_score": review["maxScore"],
        "rounds": result["round"],
        "audit_model_calls": audited["model_calls"],
        "repair_model_calls": completed["model_calls"],
        "original_digest": hashlib.sha256(original).hexdigest(),
        "new_digest": hashlib.sha256(new).hexdigest(),
        "report_digest": review["reportDigest"],
        "checks": [
            "real_model_capabilities",
            "real_failed_audit",
            "selected_scope_repair",
            "fresh_full_review_pass",
            "atomic_version_registration",
            "original_unchanged",
            "current_pointer_preserved",
            "report_and_download_digest",
            "publish_idempotency",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--credentials-file", type=Path, required=True)
    parser.add_argument("--model-config", type=Path)
    parser.add_argument(
        "--fixture", type=Path, default=Path(__file__).resolve().parent.parent / "examples/repair-demo"
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run(
        args.base_url.rstrip("/"),
        read_secret_json(args.credentials_file),
        args.fixture,
        read_secret_json(args.model_config) if args.model_config else None,
    )
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))
