"""One job at a time, durable receipts, renewable leases and model-only execution."""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx

from backend.storage import PackageError, PackageFile, extract_files, files_digest, pack_zip, unpack_zip
from worker.capabilities import detect
from worker.client import Center, ProtocolError, save_json
from worker.engine import (
    EngineError,
    assemble_eval,
    check_versions,
    evaluate,
    isolated_environment,
    tree_digest,
)
from worker.generate import generate


def clean_tree(root: Path):
    if not root.exists() or root.is_symlink():
        return
    root.chmod(0o700)
    for directory, directories, filenames in os.walk(root, followlinks=False):
        for name in directories + filenames:
            path = Path(directory) / name
            if path.is_symlink():
                path.unlink()
            else:
                path.chmod(0o700 if path.is_dir() else 0o600)
    shutil.rmtree(root)


def collect_artifacts(root: Path, include=lambda path: True) -> dict:
    files, total = {}, 0
    for path in root.rglob("*"):
        if path.is_symlink():
            raise PackageError("运行产物包含符号链接")
        if path.is_file() and include(path):
            total += path.stat().st_size
            if len(files) >= 10000 or total > 500 * 1024 * 1024:
                raise PackageError("运行产物超过限额")
            files[str(path.relative_to(root))] = PackageFile(path.read_bytes())
    return files


class Lease:
    def __init__(self, center: Center, job: dict, root: Path, capabilities: dict, started: float):
        self.center, self.job, self.root, self.capabilities = center, job, root, capabilities
        self.deadline = started + job["lease_seconds"]
        self.file = root / "lease.json"
        self.stop = threading.Event()
        self.cancelled = threading.Event()
        self.lost = threading.Event()
        self.closed = threading.Event()
        self.event_position = 0
        self.sequence = 0
        self.pending_events = []
        self.events_lock = threading.Lock()
        save_json(self.file, {"deadline": self.deadline})
        self.thread = threading.Thread(target=self.maintain, name="worker-lease", daemon=True)

    def should_stop(self):
        return self.stop.is_set() or self.cancelled.is_set() or self.lost.is_set() or time.monotonic() >= self.deadline

    def send_events(self):
        with self.events_lock:
            return self._send_events()

    def flush_events(self):
        while True:
            with self.events_lock:
                previous_position = self.event_position
                had_pending = bool(self.pending_events)
                self._send_events()
                if not self.pending_events and not had_pending and self.event_position == previous_position:
                    return

    def _send_events(self):
        file = self.root / "report/events.jsonl"
        if file.exists() and not self.pending_events:
            with file.open("rb") as stream:
                stream.seek(self.event_position)
                for _ in range(100):
                    line = stream.readline(2 * 1024 * 1024)
                    if not line:
                        break
                    overlong = False
                    while not line.endswith(b"\n") and len(line) == 2 * 1024 * 1024:
                        overlong = True
                        line = stream.readline(2 * 1024 * 1024)
                    if not line.endswith(b"\n"):
                        break
                    self.event_position = stream.tell()
                    try:
                        payload = json.loads(line)
                    except ValueError:
                        payload = {"type": "unparsed_event", "message": "原始事件无法解析，请查看日志"}
                    if overlong or not isinstance(payload, dict) or len(line) > 55 * 1024:
                        payload = {"type": "large_event", "message": "事件较大，详情保留在原始日志中"}
                    self.sequence += 1
                    self.pending_events.append({"sequence": self.sequence, "payload": payload})
        if self.pending_events:
            ack = self.center.request("POST", f"/api/worker/attempts/{self.job['attempt_id']}/events",
                                      headers={"X-Lease-Token": self.job["lease_token"]},
                                      json={"events": self.pending_events}).json()["accepted_sequence"]
            self.pending_events = [event for event in self.pending_events if event["sequence"] > ack]
        return self.event_position

    def maintain(self):
        delay = 0
        while not self.closed.wait(delay):
            started = time.monotonic()
            try:
                reply = self.center.heartbeat(self.capabilities, self.job)
                self.deadline = started + reply["lease_seconds"]
                save_json(self.file, {"deadline": self.deadline})
                if reply.get("cancel"):
                    self.cancelled.set()
                self.send_events()
                delay = reply.get("heartbeat_seconds", self.job.get("heartbeat_seconds", 10))
            except ProtocolError as error:
                if error.status in {401, 403, 404, 409}:
                    self.lost.set()
                    save_json(self.file, {"deadline": 0})
                    return
                delay = 1
            except (httpx.HTTPError, OSError, ValueError):
                delay = 1
            if time.monotonic() >= self.deadline:
                self.lost.set()
                save_json(self.file, {"deadline": 0})
                return

    def close(self):
        self.closed.set()
        self.thread.join(timeout=20)


class Worker:
    def __init__(self, center: Center, state_dir: Path, skill_up: Path, codex_home: Path,
                 assets: Path, stop: threading.Event | None = None):
        self.center, self.state_dir, self.skill_up = center, state_dir, skill_up.resolve()
        self.codex_home, self.assets = codex_home, assets
        self.stop = stop or threading.Event()
        self.active = state_dir / "active.json"

    def capabilities(self):
        return detect(self.skill_up, self.codex_home)

    def download(self, job, kind, destination):
        response = self.center.request("GET", f"/api/worker/attempts/{job['attempt_id']}/input/{kind}",
                                       headers={"X-Lease-Token": job["lease_token"]})
        import hashlib
        expected = job["input"]["skill_blob" if kind == "skill" else "suite_blob"]
        if hashlib.sha256(response.content).hexdigest() != expected or response.headers.get("X-Content-SHA256") != expected:
            raise EngineError("下载的任务输入摘要不匹配，未开始执行")
        extract_files(unpack_zip(response.content), destination)

    def execute(self, job, lease: Lease):
        root, frozen = lease.root, job["input"]
        report = root / "report"
        report.mkdir()
        metadata = {"exit_code": None, "error": "", "cancelled": False,
                    "source_digest_before": "", "source_digest_after": ""}
        try:
            self.download(job, "skill", root / "skill")
            source = root / "skill"
            before = tree_digest(source)
            expected_files = {str(p.relative_to(source)): PackageFile(p.read_bytes()) for p in source.rglob("*")
                              if p.is_file() and not str(p.relative_to(source)).startswith("evals/")}
            # Generation and evaluation both freeze the Skill source, excluding its bundled evals.
            metadata["source_digest_before"] = files_digest(expected_files)
            if metadata["source_digest_before"] != frozen["source_digest"]:
                raise EngineError("Skill 内容与冻结的源摘要不一致")
            for path in source.rglob("*"):
                path.chmod((path.stat().st_mode & 0o777) & ~0o222)
            source.chmod(0o555)
            env = isolated_environment(root / "home", self.codex_home, frozen["model"]["name"])
            env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + env["PATH"]
            check_versions(self.skill_up, env)
            if self.capabilities()["connection_fingerprint"] != frozen["model"]["connection_fingerprint"]:
                raise EngineError("Worker 连接与冻结配置不一致，未切换到其他连接")
            if lease.should_stop() or self.stop.is_set():
                raise EngineError("任务在执行前已停止")
            def should_stop():
                return lease.should_stop() or self.stop.is_set()
            if job["kind"] == "evaluate":
                self.download(job, "suite", root / "suite")
                assembled_ids = assemble_eval(source, root / "suite", root / "assembled", frozen["model"]["name"])
                if assembled_ids != [case["id"] for case in frozen["cases"]]:
                    raise EngineError("装配后的案例清单与冻结清单不一致")
                metadata["exit_code"] = evaluate(self.skill_up, root / "assembled", report, env,
                                                  frozen["timeout_seconds"], should_stop, lease.file)
            else:
                generate(source, root / "candidate", self.assets, frozen["model"]["name"], frozen["count"],
                         frozen["requirements"], env, should_stop, lease.file)
                metadata["exit_code"] = 0
            if tree_digest(source) != before:
                raise EngineError("执行过程修改了源 Skill 快照")
            metadata["source_digest_after"] = metadata["source_digest_before"]
        except Exception as error:
            metadata["error"] = f"{type(error).__name__}: {str(error)[:3500]}"
            if (root / "skill").exists():
                metadata["source_digest_after"] = files_digest({str(p.relative_to(root / "skill")): PackageFile(p.read_bytes())
                    for p in (root / "skill").rglob("*") if p.is_file() and not p.is_symlink() and not str(p.relative_to(root / "skill")).startswith("evals/")})
        metadata["cancelled"] = lease.cancelled.is_set()
        bundle = root / "bundle.zip"
        try:
            if job["kind"] == "evaluate":
                files = collect_artifacts(report, lambda path: ".guard" not in path.name)
            else:
                candidate = root / "candidate"
                files = collect_artifacts(candidate, lambda path: path.relative_to(candidate).parts[0] == "evals")
                log = root / "candidate.generation.jsonl"
                if log.exists() and log.stat().st_size <= 100 * 1024 * 1024:
                    files["logs/generation.jsonl"] = PackageFile(log.read_bytes())
                sandbox_log = report / "sandbox.log"
                if sandbox_log.exists() and sandbox_log.stat().st_size <= 1024 * 1024:
                    files["logs/sandbox.log"] = PackageFile(sandbox_log.read_bytes())
            files["diagnostic.json"] = PackageFile(json.dumps(metadata).encode())
            bundle.write_bytes(pack_zip(files))
        except (PackageError, OSError):
            metadata["error"] = "运行产物超过上传限额或包含不安全路径；原始产物保留在 Worker 本机"
            metadata["retain_local"] = True
            bundle.write_bytes(pack_zip({"diagnostic.json": PackageFile(json.dumps(metadata).encode())}))
        save_json(root / "completion.json", metadata)
        return bundle, metadata

    def upload_completion(self, job, root, metadata, lease=None):
        while True:
            try:
                self.center.complete(job, root / "bundle.zip", metadata)
                return "accepted"
            except ProtocolError as error:
                if error.status in {401, 403, 404, 409}:
                    print(str(error), flush=True)
                    return "rejected"
            except httpx.HTTPError:
                pass
            if self.stop.is_set() or (lease is not None and lease.lost.is_set()):
                return "pending"
            time.sleep(1)

    def run_job(self, job, started):
        root = Path(tempfile.mkdtemp(prefix="open-skill-eval-job-"))
        save_json(self.active, {"job": job, "root": str(root)})
        capabilities = self.capabilities()
        lease = Lease(self.center, job, root, capabilities, started)
        lease.thread.start()
        print(f"开始{'生成案例' if job['kind'] == 'generate' else '评测'}，第 {job['attempt_number']} 次执行", flush=True)
        outcome, metadata = "pending", {}
        try:
            _, metadata = self.execute(job, lease)
            if not lease.lost.is_set():
                try:
                    lease.flush_events()
                except (httpx.HTTPError, ProtocolError):
                    pass  # The raw event log is also included in the durable result bundle.
            outcome = self.upload_completion(job, root, metadata, lease)
        finally:
            lease.close()
            clean_tree(root / "home")
            if outcome == "accepted" and not metadata.get("retain_local"):
                clean_tree(root)
            if outcome == "accepted":
                self.active.unlink(missing_ok=True)
        print("结果已保存" if outcome == "accepted" else "结果暂留本机，等待恢复连接后回传", flush=True)
        return outcome == "accepted"

    def recover(self):
        if not self.active.exists():
            return
        saved = json.loads(self.active.read_text())
        root, job = Path(saved["root"]), saved["job"]
        if not root.exists():
            self.active.unlink()
            return
        save_json(root / "lease.json", {"deadline": 0})
        if not (root / "completion.json").exists():
            # Never restart an interrupted model invocation. The guardian stops the old process.
            self.stop.wait(1)
            metadata = {"exit_code": None, "error": "Worker 重新启动，原执行已中断；未自动重跑", "cancelled": False,
                        "source_digest_before": "", "source_digest_after": ""}
            (root / "bundle.zip").write_bytes(pack_zip({"diagnostic.json": PackageFile(json.dumps(metadata).encode())}))
            save_json(root / "completion.json", metadata)
        metadata = json.loads((root / "completion.json").read_text())
        outcome = self.upload_completion(job, root, metadata)
        clean_tree(root / "home")
        if outcome == "accepted" and not metadata.get("retain_local"):
            clean_tree(root)
        # Rejected stale receipts remain as local diagnostics, but must never block a new manual attempt.
        if outcome != "pending":
            self.active.unlink(missing_ok=True)

    def probe(self, command):
        root = Path(tempfile.mkdtemp(prefix="open-skill-eval-probe-"))
        started, success, message = time.monotonic(), False, "模型请求失败，请检查 Worker 的 Codex 登录和模型名称"
        observed_version = ""
        try:
            env = isolated_environment(root / "home", self.codex_home, command["model"])
            checked = check_versions(self.skill_up, env)
            observed_version = checked["codex"].removeprefix("codex-cli ")
            guard = root / "lease.json"
            save_json(guard, {"deadline": started + 90})
            from worker.engine import run_process
            code = run_process(["codex", "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only",
                                "-m", command["model"], "Reply with CONNECTION_OK only. Do not use tools or read files."],
                               root, env, root / "probe.jsonl", 90, self.stop.is_set, guard)
            events = [json.loads(line) for line in (root / "probe.jsonl").read_text().splitlines() if line.startswith("{")]
            success = code == 0 and any(row.get("item", {}).get("type") == "agent_message" and row["item"].get("text", "").strip() == "CONNECTION_OK" for row in events)
            if success:
                message = "实际模型请求成功；服务端模型身份未核实"
        except (EngineError, OSError, ValueError):
            pass
        finally:
            clean_tree(root)
        return {"id": command["id"], "model": command["model"], "success": success, "message": message,
                "observed_version": observed_version, "observed_model": None, "duration_ms": int((time.monotonic() - started) * 1000)}

    def run(self, once=False):
        self.recover()
        last_error = None
        while not self.stop.is_set():
            try:
                if self.active.exists():
                    self.recover()
                    if self.active.exists():
                        self.stop.wait(3)
                        continue
                capabilities = self.capabilities()
                reply = self.center.heartbeat(capabilities)
                if reply.get("probe"):
                    command = reply["probe"]
                    cache_file = self.state_dir / "probe.json"
                    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
                    if cache.get("id") == command["id"]:
                        result = cache.get("result") or {"id": command["id"], "model": command["model"], "success": False,
                            "message": "上次连接检查被中断；未自动重复调用", "observed_version": "", "observed_model": None, "duration_ms": 0}
                    else:
                        save_json(cache_file, {"id": command["id"], "result": None})
                        result = self.probe(command)
                        save_json(cache_file, {"id": command["id"], "result": result})
                    self.center.heartbeat(capabilities, probe_result=result)
                started = time.monotonic()
                reply = self.center.request("POST", "/api/worker/claim", json={"capabilities": capabilities}).json()
                if reply["job"]:
                    if not self.run_job(reply["job"], started):
                        self.recover()
                    if once:
                        return
                elif once:
                    return
                last_error = None
                self.stop.wait(reply.get("poll_seconds", 3))
            except ProtocolError as error:
                if error.status in {401, 403}:
                    raise
                if str(error) != last_error:
                    print(str(error), flush=True)
                    last_error = str(error)
                self.stop.wait(5)
            except httpx.HTTPError:
                if last_error != "offline":
                    print("中心暂时无法连接，稍后重试；不会重新执行已领取的任务", flush=True)
                    last_error = "offline"
                self.stop.wait(5)
