"""Run against an installed console entry point, without importing project code."""

import argparse
import hashlib
import http.cookiejar
import io
import json
import secrets
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path


def smoke(executable: Path) -> dict:
    checks = []
    with tempfile.TemporaryDirectory(prefix="skill-mng-wheel-") as temp:
        workspace = Path(temp)
        data = workspace / "data"
        password = secrets.token_urlsafe(24)
        password_file = workspace / "password"
        password_file.write_text(password)
        password_file.chmod(0o600)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]

        def run(*args, root=data):
            result = subprocess.run(
                [str(executable), "--data-dir", str(root), *args],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=30,
            )
            assert result.returncode == 0, result.stderr
            assert password not in result.stdout + result.stderr
            return json.loads(result.stdout)

        initial = run(
            "setup", "--username", "smoke", "--password-file", str(password_file), "--port", str(port)
        )
        assert initial["initialized"]
        with sqlite3.connect(data / "registry.db") as db:
            original_hash = db.execute("SELECT password_hash FROM users").fetchone()[0]
        assert run("setup", "--username", "different", "--password-file", "/nonexistent")["reused"]
        with sqlite3.connect(data / "registry.db") as db:
            assert db.execute("SELECT password_hash FROM users").fetchone()[0] == original_hash
        checks.append("setup_idempotent")
        try:
            started = run("start")
            assert started["running"]
            again = run("start")
            assert again["reused"] and again["pid"] == started["pid"]
            assert run("status")["running"]
            checks.append("start_idempotent")
            base = f"http://127.0.0.1:{port}"
            client = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
                urllib.request.ProxyHandler({}),
            )
            with client.open(base + "/") as response:
                assert "Skill 工作台" in response.read().decode()
            with client.open(base + "/static/app.js") as response:
                assert "function library" in response.read().decode()
            body = json.dumps({"username": "smoke", "password": password}).encode()
            request = urllib.request.Request(
                base + "/api/login", data=body, headers={"Content-Type": "application/json"}
            )
            with client.open(request) as response:
                csrf = json.load(response)["csrf"]
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as archive:
                archive.writestr("SKILL.md", "---\nname: wheel-smoke\nversion: 1.0.0\n---\n# Example")
            raw = output.getvalue()
            boundary = secrets.token_hex(12)
            payload = (
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="skill.zip"\r\nContent-Type: application/zip\r\n\r\n'.encode()
                + raw
                + f"\r\n--{boundary}--\r\n".encode()
            )
            request = urllib.request.Request(
                base + "/api/import/upload",
                data=payload,
                headers={"X-CSRF-Token": csrf, "Content-Type": f"multipart/form-data; boundary={boundary}"},
            )
            with client.open(request) as response:
                version = json.load(response)["version_id"]
            with client.open(base + f"/api/versions/{version}/download") as response:
                assert hashlib.sha256(response.read()).digest() == hashlib.sha256(raw).digest()
            checks.append("wheel_static_api_upload_download")

            def api(path, body=None):
                request = urllib.request.Request(
                    base + "/api" + path,
                    data=json.dumps(body).encode() if body is not None else None,
                    headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
                )
                with client.open(request) as response:
                    return json.load(response)

            assert run("worker", "status")["implemented"]
            assert run("worker", "status")["running"]
            audit = api(
                "/audits",
                {"version_id": version, "depth": "L1", "mode": "static", "idempotency_key": "native-audit"},
            )

            def await_report(run_id):
                for _ in range(60):
                    audit_report = api("/audits/" + run_id)
                    if audit_report["result"]:
                        result = audit_report["result"]
                        assert (
                            hashlib.sha256(result["reportMarkdown"].encode()).hexdigest()
                            == result["reportDigest"]
                        )
                        assert result["verdict"] == "fail" and result["reviewRequired"]
                        return result
                    time.sleep(0.5)
                raise AssertionError("worker did not deliver a report")

            await_report(audit["audit_run_id"])
            checks.append("native_builtin_worker_real_static_audit")
            run("worker", "stop")
            external = workspace / "external-worker"
            enrollment = api("/worker-enrollments", {})
            joined = subprocess.run(
                [
                    str(executable),
                    "--data-dir",
                    str(external),
                    "worker",
                    "join",
                    "--server",
                    base,
                    "--code-stdin",
                ],
                input=enrollment["code"] + "\n",
                capture_output=True,
                text=True,
                timeout=20,
                cwd=workspace,
            )
            assert joined.returncode == 0, joined.stderr
            assert enrollment["code"] not in joined.stdout + joined.stderr
            assert not (external / "registry.db").exists()
            try:
                run("worker", "start", root=external)
                second = api(
                    "/audits",
                    {
                        "version_id": version,
                        "depth": "L2",
                        "mode": "static",
                        "idempotency_key": "external-audit",
                    },
                )
                await_report(second["audit_run_id"])
                run("worker", "stop", root=external)
                run("worker", "start", root=external)
                assert run("worker", "status", root=external)["running"]
                checks.append("external_worker_join_separate_storage_audit_restart")
            finally:
                run("worker", "stop", root=external)
            snapshot = workspace / "backup.zip"
            assert run("backup", str(snapshot))["artifacts"] == 1
            restored = workspace / "restored"
            assert run("restore", str(snapshot), root=restored)["artifacts"] == 1
            assert run("doctor", root=restored)["sqlite"] == "ok"
            checks.append("backup_restore")
            assert run("doctor")["journal"] == "wal"
            assert run("worker", "status")["implemented"]
        finally:
            run("stop")
        assert not run("status")["running"]
        try:
            assert run("start")["running"]  # reuse the same port immediately after stop
        finally:
            run("stop")
        checks.append("stop_restart_same_port")
        return {"passed": True, "checks": checks}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("executable", type=Path)
    args = parser.parse_args()
    print(json.dumps(smoke(args.executable.resolve()), indent=2))
