"""Independent worker: HTTP-only platform access, one bounded child process per audit."""

import fcntl
import hashlib
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

from .config import prepare, write_secret_json
from .lifecycle import lifecycle_lock, process_record
from .tasks import RULE_VERSION
from .worker_client import Client, RequestFailure, server_url


def credentials_path(root):
    return Path(os.environ.get("SKILL_MNG_WORKER_CREDENTIALS", str(root / "worker/credentials.json")))


def join(root: Path, server: str, code: str, name: str, replace=False):
    prepare(root)
    if process_record(root, "worker"):
        raise ValueError("请先停止本地 worker 再重新接入")
    path = credentials_path(root)
    if path.exists() and not replace:
        raise ValueError("已有接入凭据；如需替换，使用 --replace")
    client = Client(server_url(server))
    try:
        result = client.request("/worker/enroll", {"code": code, "name": name})
    except RequestFailure as exc:
        raise ValueError(
            "接入未完成；若回执丢失，请管理员撤销未上线登记，再生成新码。错误：" + exc.code
        ) from None
    write_secret_json(path, {**result, "server": server_url(server), "builtin": False})
    return {"worker_id": result["id"], "server": server_url(server), "credential_saved": str(path)}


def launch(root: Path):
    with lifecycle_lock(root):
        record = process_record(root, "worker")
        if record:
            return {"running": True, "pid": record["pid"], "reused": True}
        if not credentials_path(root).exists():
            raise ValueError("尚未接入平台，请先 worker join 或在本机 start 自动配对")
        token = secrets.token_hex(24)
        with (root / "run/worker.log").open("ab") as log:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "skill_mng.cli",
                    "--data-dir",
                    str(root),
                    "worker",
                    "run",
                    "--instance",
                    token,
                ],
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        for _ in range(50):
            if process.poll() is not None:
                raise RuntimeError("worker 启动失败，请查看 worker logs")
            if process_record(root, "worker"):
                return {"running": True, "pid": process.pid, "reused": False}
            time.sleep(0.1)
        raise RuntimeError("worker 启动超时，请查看 worker logs")


def validate_manifest(manifest):
    for key in ("taskId", "auditRunId", "attemptId", "skillId", "versionId"):
        if not re.fullmatch("[a-f0-9]{32}", manifest.get(key, "")):
            raise ValueError("invalid_manifest_identity")
    for key in ("contentDigest", "artifactDigest"):
        if not re.fullmatch("[a-f0-9]{64}", manifest.get(key, "")):
            raise ValueError("invalid_manifest_digest")
    if (
        manifest.get("ruleVersion") != RULE_VERSION
        or manifest.get("depth") not in {"L1", "L2"}
        or manifest.get("mode") not in {"static", "full"}
    ):
        raise ValueError("unsupported_manifest")


def terminate_child(child):
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=3)


def execute(root, client, manifest, stop):
    validate_manifest(manifest)
    workdir = root / "worker/attempts" / manifest["attemptId"]
    workdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    cache = root / "worker/frozen" / f"{manifest['auditRunId']}.json"
    write_secret_json(root / "worker/current.json", manifest)
    write_secret_json(workdir / "manifest.json", manifest)
    result = None
    if cache.exists():
        previous = json.loads(cache.read_text())
        if all(
            previous.get(k) == manifest.get(k)
            for k in (
                "taskId",
                "auditRunId",
                "versionId",
                "contentDigest",
                "artifactDigest",
                "depth",
                "ruleVersion",
            )
        ):
            result = {
                **previous,
                "attemptId": manifest["attemptId"],
                "leaseGeneration": manifest["leaseGeneration"],
            }
    local_result = workdir / "result.json"
    if result is None and local_result.exists():
        if manifest.get("kind") == "repair":
            result = json.loads(local_result.read_text())
            if any(
                result.get(k) != manifest.get(k)
                for k in ("taskId", "auditRunId", "repairRunId", "attemptId", "leaseGeneration")
            ):
                raise ValueError("cached_repair_identity_mismatch")
        else:
            from .auditing import validate_result

            result = validate_result(json.loads(local_result.read_text()), manifest)
        write_secret_json(cache, result)
    if result is None:
        raw = client.request(
            f"/worker/attempts/{manifest['attemptId']}/package?generation={manifest['leaseGeneration']}",
            binary=True,
        )
        if hashlib.sha256(raw).hexdigest() != manifest["artifactDigest"]:
            raise ValueError("package_digest_mismatch")
        original = workdir / "original.zip"
        if original.exists():
            if hashlib.sha256(original.read_bytes()).hexdigest() != manifest["artifactDigest"]:
                raise ValueError("local_package_digest_mismatch")
        else:
            original.write_bytes(raw)
            original.chmod(0o400)
        with (workdir / "runner.log").open("ab") as log:
            child = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "skill_mng.runner",
                    "--credentials",
                    str(credentials_path(root)),
                    "--manifest",
                    str(workdir / "manifest.json"),
                    "--workdir",
                    str(workdir),
                ],
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        started, last_beat, last_ok = time.monotonic(), 0, time.monotonic()
        try:
            while child.poll() is None:
                if stop.wait(0.2):
                    return
                current = time.monotonic()
                if current - started > min(1200, manifest["limits"]["durationSeconds"]):
                    terminate_child(child)
                    client.request(
                        f"/worker/attempts/{manifest['attemptId']}/failure",
                        {"generation": manifest["leaseGeneration"], "code": "timeout"},
                    )
                    return
                if current - last_beat >= 5:
                    try:
                        heartbeat = client.request(
                            f"/worker/attempts/{manifest['attemptId']}/heartbeat",
                            {"generation": manifest["leaseGeneration"]},
                        )
                        last_ok = current
                        if heartbeat["cancel_requested"]:
                            terminate_child(child)
                            client.request(
                                f"/worker/attempts/{manifest['attemptId']}/failure",
                                {"generation": manifest["leaseGeneration"], "code": "cancelled"},
                            )
                            return
                    except RequestFailure as exc:
                        if exc.status in (401, 403, 409) or current - last_ok >= 24:
                            raise
                    last_beat = current
        finally:
            terminate_child(child)
        if child.returncode or not (workdir / "result.json").exists():
            failure = (
                json.loads((workdir / "failure.json").read_text())
                if (workdir / "failure.json").exists()
                else {"code": "worker_error", "retryable": False}
            )
            print(
                json.dumps(
                    {
                        "runner_failure": failure["code"],
                        "error_type": failure.get("error_type"),
                        "frames": failure.get("frames", []),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            client.request(
                f"/worker/attempts/{manifest['attemptId']}/failure",
                {"generation": manifest["leaseGeneration"], **failure},
            )
            return
        result = json.loads((workdir / "result.json").read_text())
        write_secret_json(cache, result)
    for attempt in range(5):
        if stop.is_set():
            return
        try:
            beat = client.request(
                f"/worker/attempts/{manifest['attemptId']}/heartbeat",
                {"generation": manifest["leaseGeneration"]},
            )
            if beat["cancel_requested"]:
                client.request(
                    f"/worker/attempts/{manifest['attemptId']}/failure",
                    {"generation": manifest["leaseGeneration"], "code": "cancelled"},
                )
                return
            client.request(
                f"/worker/attempts/{manifest['attemptId']}/result",
                {"generation": manifest["leaseGeneration"], "result": result},
            )
            return
        except RequestFailure as exc:
            if exc.status in (400, 422):
                client.request(
                    f"/worker/attempts/{manifest['attemptId']}/failure",
                    {"generation": manifest["leaseGeneration"], "code": "invalid_result"},
                )
                return
            if exc.status and exc.status < 500 and exc.status != 429:
                raise
            if stop.wait(min(2**attempt, 8)):
                return
    # Preserve frozen bytes for recovery; never trigger a new semantic score just because delivery failed.
    client.request(
        f"/worker/attempts/{manifest['attemptId']}/failure",
        {"generation": manifest["leaseGeneration"], "code": "delivery_failed"},
    )


def run(root: Path, instance=None):
    prepare(root)
    with (root / "run/worker.lock").open("a") as lease:
        try:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("此目录已有 worker 运行") from None
        credentials = json.loads(credentials_path(root).read_text())
        client = Client(
            credentials["server"], credentials["credential"], internal=credentials.get("builtin", False)
        )
        record = root / "run/worker.json"
        if instance:
            write_secret_json(record, {"pid": os.getpid(), "instance": instance, "data_dir": str(root)})
        stop = threading.Event()
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, lambda *_: stop.set())
        current_file = root / "worker/current.json"
        pending = json.loads(current_file.read_text()) if current_file.exists() else None
        try:
            while not stop.is_set():
                task = None
                try:
                    if pending:
                        try:
                            client.request(
                                f"/worker/attempts/{pending['attemptId']}/heartbeat",
                                {"generation": pending["leaseGeneration"]},
                            )
                            task = pending
                        except RequestFailure as exc:
                            if exc.status != 409:
                                raise
                        pending = None
                    if not task:
                        task = client.request("/worker/tasks/claim", {})["task"]
                    write_secret_json(
                        root / "worker/state.json",
                        {
                            "connected": True,
                            "task_id": task["taskId"] if task else None,
                            "seen_at": time.time(),
                            "last_error": None,
                        },
                    )
                    if task:
                        execute(root, client, task, stop)
                        if not stop.is_set():
                            current_file.unlink(missing_ok=True)
                except RequestFailure as exc:
                    write_secret_json(
                        root / "worker/state.json",
                        {"connected": False, "last_error": exc.code, "seen_at": time.time()},
                    )
                    if exc.status in (401, 403):
                        break
                except (ValueError, OSError, KeyError, TypeError):
                    write_secret_json(
                        root / "worker/state.json",
                        {"connected": False, "last_error": "worker_error", "seen_at": time.time()},
                    )
                    if task:
                        try:
                            client.request(
                                f"/worker/attempts/{task['attemptId']}/failure",
                                {"generation": task["leaseGeneration"], "code": "worker_error"},
                            )
                        except RequestFailure:
                            pass
                stop.wait(1)
        finally:
            if instance:
                record.unlink(missing_ok=True)
