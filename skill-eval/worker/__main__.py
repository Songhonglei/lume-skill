import argparse
import fcntl
import getpass
import json
import os
import signal
import socket
import threading
from pathlib import Path

import httpx

from worker.capabilities import detect
from worker.client import Center, ProtocolError, parse_enrollment, save_json
from worker.runtime import Worker


def main():
    parser = argparse.ArgumentParser(description="独立 Skill Eval Worker：输入一个工作台接入码即可连接")
    parser.add_argument("--state-dir", type=Path, default=Path.home() / ".local/share/open-skill-eval-worker")
    parser.add_argument("--codex-home", type=Path, default=Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))))
    parser.add_argument("--skill-up", type=Path)
    parser.add_argument("--assets", type=Path, default=Path(__file__).resolve().parent.parent / "vendor/skill-upper")
    parser.add_argument("--once", action="store_true", help="领取并处理一个任务后退出，用于诊断")
    parser.add_argument("--builtin-url", default=os.environ.get("OSE_CENTER_URL", ""), help=argparse.SUPPRESS)
    parser.add_argument("--builtin-secret-file", type=Path, default=os.environ.get("OSE_BUILTIN_SECRET_FILE"), help=argparse.SUPPRESS)
    options = parser.parse_args()
    options.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    options.state_dir.chmod(0o700)
    lock = (options.state_dir / "worker.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("同一个接入目录已有 Worker 在运行") from None
    skill_up = options.skill_up or options.state_dir / "bin/skill-up"
    if options.skill_up is not None and not skill_up.is_file():
        raise SystemExit("指定的 skill-up 文件不存在，请检查 --skill-up 路径")
    if not skill_up.exists():
        skill_up = Path(__file__).resolve().parent.parent / ".local/bin/skill-up"
    state_file = options.state_dir / "connection.json"
    if not state_file.exists():
        capabilities = detect(skill_up, options.codex_home)
        if options.builtin_secret_file:
            stop = threading.Event()
            while not options.builtin_secret_file.exists():
                stop.wait(1)
            enrollment = {"url": options.builtin_url, "code": options.builtin_secret_file.read_text().strip()}
            endpoint = "/api/worker/builtin-enroll"
        else:
            enrollment = parse_enrollment(getpass.getpass("粘贴工作台接入码："))
            endpoint = "/api/worker/enroll"
        center = Center(enrollment["url"])
        try:
            registered = center.request("POST", endpoint, json={"code": enrollment["code"], "name": socket.gethostname()[:120], "capabilities": capabilities}).json()
        finally:
            center.close()
        save_json(state_file, {"url": enrollment["url"], **registered})
        print("Worker 已接入，凭据保存在本机，下次启动自动连接", flush=True)
    state = json.loads(state_file.read_text())
    center = Center(state["url"], state["token"])
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        capabilities = detect(skill_up, options.codex_home)
        if capabilities["diagnostic"]:
            print(capabilities["diagnostic"], flush=True)
        Worker(center, options.state_dir, skill_up, options.codex_home, options.assets, stop).run(options.once)
    finally:
        center.close()
        lock.close()


if __name__ == "__main__":
    try:
        main()
    except (ProtocolError, httpx.HTTPError) as error:
        raise SystemExit(str(error)) from None
