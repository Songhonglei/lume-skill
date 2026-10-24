"""POSIX lifecycle with process identity and an exclusive server lease."""

import fcntl
import json
import os
import secrets
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path

from .config import prepare, read_config


@contextmanager
def lifecycle_lock(root: Path):
    prepare(root)
    with (root / "run/lifecycle.lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def process_record(root: Path, kind: str = "server") -> dict | None:
    path = root / "run" / f"{kind}.json"
    if not path.exists():
        return None
    try:
        record = json.loads(path.read_text())
        pid, token = record["pid"], record["instance"]
        if not isinstance(pid, int) or pid <= 1 or not isinstance(token, str) or len(token) != 48:
            raise ValueError("invalid process record")
        if sys.platform == "linux":
            try:
                command = Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode()
                process_state = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].strip()[0]
            except FileNotFoundError:
                return None
            if not command or process_state == "Z":
                return None
        else:
            result = subprocess.run(
                ["ps", "-p", str(pid), "-o", "args="], capture_output=True, text=True, check=False
            )
            if not result.stdout.strip():
                return None
            status = subprocess.run(
                ["ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True, check=False
            )
            if status.stdout.strip().startswith("Z"):
                return None
            command = result.stdout.strip()
        if token not in command or "skill_mng.cli" not in command or record.get("data_dir") != str(root):
            raise RuntimeError("PID 已被其他进程占用，拒绝发送信号；请核对 run/server.json")
        return record
    except FileNotFoundError:
        return None
    except (KeyError, json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError("进程记录损坏，请核对 run/server.json，程序不会猜测 PID") from exc


def health_url(config: dict) -> str:
    host = config["host"]
    host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    if ":" in host:
        host = f"[{host}]"
    return f"http://{host}:{config['port']}/api/health"


def start(root: Path) -> dict:
    with lifecycle_lock(root):
        current = process_record(root)
        if current:
            return {"running": True, "pid": current["pid"], "reused": True}
        config = read_config(root)
        family = socket.AF_INET6 if ":" in config["host"] else socket.AF_INET
        with socket.socket(family) as check:
            # Uvicorn also enables reuse; do not mistake TIME_WAIT from a stopped
            # instance for another listener occupying this port.
            check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                check.bind((config["host"], config["port"]))
            except OSError as exc:
                raise RuntimeError(f"端口 {config['port']} 不可用，请修改 config.json 中的 port") from exc
        token = secrets.token_hex(24)
        with (root / "run/server.log").open("ab") as log:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "skill_mng.cli",
                    "--data-dir",
                    str(root),
                    "server",
                    "run",
                    "--instance",
                    token,
                ],
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                start_new_session=True,
                close_fds=True,
            )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("服务未能启动，请运行 skill-mng logs 查看原因")
            try:
                with opener.open(health_url(config), timeout=0.3) as response:
                    if response.status == 200 and process_record(root):
                        return {"running": True, "pid": process.pid, "reused": False}
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.1)
        if process_record(root):
            process.terminate()
            process.wait(timeout=5)
        raise RuntimeError("启动超时，请检查日志和数据目录")


def stop(root: Path, kind: str = "server") -> dict:
    with lifecycle_lock(root):
        record = process_record(root, kind)
        if not record:
            return {"running": False}
        os.kill(record["pid"], signal.SIGTERM)
        for _ in range(100):
            try:
                still_running = process_record(root, kind)
            except RuntimeError:
                # Initial identity was verified before SIGTERM. Never signal again;
                # an exiting/reused PID is no longer the managed process.
                still_running = None
            if not still_running:
                (root / "run" / f"{kind}.json").unlink(missing_ok=True)
                return {"running": False}
            time.sleep(0.1)
        raise RuntimeError("服务仍在退出中，请检查日志；未强制终止")


def run_server(root: Path, instance: str | None = None):
    import uvicorn

    from .app import create_app
    from .auth import bootstrap_token
    from .db import migrate

    prepare(root)
    with (root / "run/server.lock").open("a") as lease:
        try:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("此数据目录已有服务运行，禁止重复启动") from exc
        migrate(root)
        bootstrap_token(root)
        config = read_config(root)
        from .tasks import builtin_worker

        builtin_worker(
            root,
            Path(os.environ.get("SKILL_MNG_BUILTIN_CREDENTIALS", str(root / "worker/credentials.json"))),
            os.environ.get("SKILL_MNG_WORKER_SERVER", health_url(config).removesuffix("/api/health")),
        )
        record_path = root / "run/server.json"
        if instance:
            record_path.write_text(
                json.dumps({"pid": os.getpid(), "instance": instance, "data_dir": str(root)})
            )
            record_path.chmod(0o600)
        print(f"初始化凭据（如尚未设置）：{root / 'run/setup-code'}", flush=True)
        try:
            uvicorn.run(
                create_app(root),
                host=config["host"],
                port=config["port"],
                proxy_headers=False,
                access_log=False,
                log_level="info",
                timeout_graceful_shutdown=3,
            )
        finally:
            if instance:
                record_path.unlink(missing_ok=True)
