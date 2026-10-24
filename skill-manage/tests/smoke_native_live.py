"""Installed console entry point + real configured model, isolated temp data and checked restore."""

import argparse
import json
import secrets
import socket
import sqlite3
import subprocess
import tempfile
from pathlib import Path

from smoke_live import read_secret_json, run


def smoke(executable, model_config, fixture):
    with tempfile.TemporaryDirectory(prefix="skill-mng-real-") as directory:
        temp = Path(directory)
        data = temp / "data"
        password = secrets.token_urlsafe(24)
        password_file = temp / "password"
        password_file.write_text(password)
        password_file.chmod(0o600)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]

        def cli(*args, root=data):
            process = subprocess.run(
                [str(executable), "--data-dir", str(root), *args],
                cwd=temp,
                capture_output=True,
                text=True,
                timeout=40,
            )
            if process.returncode:
                raise RuntimeError("CLI failed: " + process.stderr[-1000:])
            assert password not in process.stdout + process.stderr
            return json.loads(process.stdout)

        cli("setup", "--username", "live-smoke", "--password-file", str(password_file), "--port", str(port))
        try:
            assert cli("start")["worker"]["running"]
            result = run(
                f"http://127.0.0.1:{port}",
                {"username": "live-smoke", "password": password},
                fixture,
                read_secret_json(model_config),
            )
            backup = temp / "snapshot.zip"
            restored = temp / "restored"
            cli("backup", str(backup))
            cli("restore", str(backup), root=restored)
            assert cli("doctor", root=restored)["sqlite"] == "ok"
            assert not (restored / "model-config.json").exists()
            with sqlite3.connect(restored / "registry.db") as db:
                digest = db.execute(
                    "SELECT report_digest FROM audit_runs WHERE version_id=?", (result["version_id"],)
                ).fetchone()[0]
                assert digest == result["report_digest"]
                assert not db.execute("SELECT 1 FROM workers WHERE revoked_at IS NULL").fetchone()
            result["checks"].extend(
                [
                    "isolated_installed_cli",
                    "backup_restored_report_digest",
                    "restore_no_model_key",
                    "restored_old_workers_revoked",
                ]
            )
        except Exception as exc:
            diagnostic = []
            for path in (data / "worker/attempts").glob("*/failure.json"):
                item = json.loads(path.read_text())
                diagnostic.append({key: item.get(key) for key in ("code", "error_type", "frames")})
            with sqlite3.connect(data / "registry.db") as db:
                model_failures = [
                    json.loads(row[0])
                    for row in db.execute("SELECT detail_json FROM events WHERE kind='model.failed'")
                ]
            raise RuntimeError(
                "Native live validation failed; runner diagnostics: "
                + json.dumps(diagnostic)
                + "; model failures: "
                + json.dumps(model_failures)
            ) from exc
        finally:
            cli("stop")
        assert not cli("status")["running"]
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    parser.add_argument("--model-config", type=Path, required=True)
    parser.add_argument(
        "--fixture", type=Path, default=Path(__file__).resolve().parent.parent / "examples/repair-demo"
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = smoke(args.executable.resolve(), args.model_config.resolve(), args.fixture.resolve())
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))
