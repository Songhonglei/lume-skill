"""Thin, pinned adapters. No internal model defaults and no sandbox fallback."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import tomllib
from collections.abc import Callable
from pathlib import Path

import yaml

SKILL_UP_VERSION = "0.14.0"
CODEX_VERSION = "0.162.1"


class EngineError(RuntimeError):
    pass


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise EngineError("Symbolic links are not allowed")
        if path.is_file():
            name = path.relative_to(root).as_posix().encode()
            content = path.read_bytes()
            digest.update(len(name).to_bytes(8, "big") + name)
            digest.update(len(content).to_bytes(8, "big") + content)
    return digest.hexdigest()


def isolated_environment(home: Path, codex_source: Path, model: str) -> dict[str, str]:
    """Only the selected model connection/login is copied; no skills, hooks, MCP or history."""
    if not model.strip():
        raise EngineError("Select a model before executing")
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    config_dir = home / ".codex"
    config_dir.mkdir(mode=0o700)
    original = codex_source / "config.toml"
    config = tomllib.loads(original.read_text()) if original.exists() else {}
    provider = config.get("model_provider", "openai")
    provider_config = config.get("model_providers", {}).get(provider, {})
    lines = [f"model = {json.dumps(model)}", 'approval_policy = "never"',
             'sandbox_mode = "workspace-write"', 'cli_auth_credentials_store = "file"',
             'web_search = "disabled"', 'model_reasoning_effort = "low"',
             'project_doc_max_bytes = 0']
    env = {key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR")
           if key in os.environ}
    if provider != "openai":
        if not provider_config:
            raise EngineError("Selected Codex provider configuration is missing")
        lines.append(f"model_provider = {json.dumps(provider)}")
        lines.append(f"[model_providers.{json.dumps(provider)}]")
        for key in ("name", "base_url", "wire_api", "env_key", "requires_openai_auth"):
            value = provider_config.get(key)
            if value is not None:
                lines.append(f"{key} = {json.dumps(value)}")
        env_key = provider_config.get("env_key")
        if env_key:
            if env_key not in os.environ:
                raise EngineError(f"Model credential environment variable is missing: {env_key}")
            env[env_key] = os.environ[env_key]
    config_file = config_dir / "config.toml"
    config_file.write_text("\n".join(lines) + "\n")
    config_file.chmod(0o600)
    auth = codex_source / "auth.json"
    if auth.exists():
        target = config_dir / "auth.json"
        shutil.copyfile(auth, target)
        target.chmod(0o600)
    env.update(HOME=str(home.resolve()), CODEX_HOME=str(config_dir.resolve()),
               TMPDIR=str((home / "tmp").resolve()), NO_COLOR="1", TERM="dumb",
               GIT_CEILING_DIRECTORIES=str(home.parent.resolve()))
    (home / "tmp").mkdir(mode=0o700)
    return env


def run_process(args: list[str], cwd: Path, env: dict[str, str], log: Path,
                timeout: float, should_stop: Callable[[], bool] = lambda: False,
                lease_file: Path | None = None) -> int:
    """Stop the whole process group on cancellation/timeout, including CLI grandchildren."""
    if lease_file is not None:
        spec = log.with_suffix(".guard.json")
        result = log.with_suffix(".guard-result.json")
        spec.write_text(json.dumps({"args": args, "cwd": str(cwd), "log": str(log),
                                    "timeout": timeout, "lease_file": str(lease_file),
                                    "result": str(result)}))
        spec.chmod(0o600)
        guarded_env = {**env, "PYTHONPATH": str(Path(__file__).resolve().parent.parent)}
        code = run_process([sys.executable, "-m", "worker.supervisor", str(spec)], cwd,
                           guarded_env, log.with_suffix(".guardian.log"), timeout + 10, should_stop)
        if not result.exists():
            raise EngineError("Execution supervisor did not return a result")
        payload = json.loads(result.read_text())
        if payload.get("error"):
            raise EngineError(payload["error"])
        return payload.get("exit_code", code)
    if should_stop():
        raise EngineError("Execution cancelled or lease lost before start")
    with log.open("wb") as output:
        process = subprocess.Popen(args, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        started = time.monotonic()
        try:
            while process.poll() is None:
                if should_stop():
                    raise EngineError("Execution cancelled or lease lost")
                if time.monotonic() - started > timeout:
                    raise EngineError("Execution timed out")
                time.sleep(0.2)
            return process.returncode
        finally:
            if process.poll() is None:
                terminate_tree(process.pid)
                process.wait()


def process_snapshot() -> dict[int, tuple[int, str]]:
    result = subprocess.run(["ps", "-axo", "pid=,ppid=,lstart="], capture_output=True,
                            text=True, check=False, timeout=5)
    rows = {}
    for line in result.stdout.splitlines():
        parts = line.split(maxsplit=2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            rows[int(parts[0])] = (int(parts[1]), parts[2])
    return rows


def terminate_tree(root_pid: int):
    """Native CLI children can create their own groups. Track identities to avoid PID reuse."""
    snapshot = process_snapshot()
    descendants = {root_pid}
    while True:
        expanded = descendants | {pid for pid, (parent, _) in snapshot.items() if parent in descendants}
        if expanded == descendants:
            break
        descendants = expanded
    identities = {pid: snapshot[pid] for pid in descendants if pid in snapshot}
    for pid in sorted(identities, key=lambda value: value == root_pid):
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    time.sleep(0.3)
    current = process_snapshot()
    for pid, (_, started) in identities.items():
        if pid in current and current[pid][1] == started:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def check_versions(skill_up: Path, env: dict[str, str]) -> dict[str, str]:
    result = {}
    for name, command, expected in (
        ("skill_up", [str(skill_up), "--version"], f"skill-up version {SKILL_UP_VERSION}"),
        ("codex", ["codex", "--version"], f"codex-cli {CODEX_VERSION}"),
    ):
        check = subprocess.run(command, check=False, env=env, capture_output=True, text=True, timeout=15)
        actual = check.stdout.strip()
        if check.returncode or actual != expected:
            raise EngineError(f"{name} version mismatch: expected {expected}, got {actual}")
        result[name] = actual
    return result


def check_sandbox(output: Path, env: dict[str, str],
                  should_stop: Callable[[], bool] = lambda: False,
                  lease_file: Path | None = None) -> None:
    """Fail before inference when the Linux sandbox cannot execute or write its workspace."""
    if not sys.platform.startswith("linux"):
        return
    workspace = output / "sandbox-check"
    workspace.mkdir(parents=True)
    code = run_process(["codex", "sandbox", "--", "/bin/sh", "-c",
                        'printf sandbox-ready > probe && test "$(cat probe)" = sandbox-ready && rm probe'],
                       workspace, env, output / "sandbox.log", 15, should_stop, lease_file)
    if code:
        raise EngineError("Codex 沙箱自检失败，尚未调用模型；请查看 sandbox.log 并使用兼容的 Worker 环境，不会绕过沙箱")


def assemble_eval(skill: Path, suite: Path, destination: Path, model: str) -> list[str]:
    """Assemble copies; original snapshots remain untouched. Call policy validation first."""
    shutil.copytree(skill, destination, ignore=shutil.ignore_patterns("evals"))
    destination.chmod(0o755)
    shutil.copytree(suite / "evals", destination / "evals")
    entry = destination / "evals/eval.yaml"
    config = yaml.safe_load(entry.read_text())
    config["engine"] = {"name": "codex", "version": CODEX_VERSION, "model": {"name": model}}
    config["environment"] = {**config.get("environment", {}), "type": "none"}
    config["skills"] = [{"source": "local_path", "path": "."}]
    cases = config["cases"]
    cases["parallelism"] = 1
    cases["retry_policy"] = {"max_retries": 0}
    defaults = cases.setdefault("defaults", {})
    defaults.setdefault("timeout_seconds", 300)
    config["benchmark"] = {"enabled": False}
    ids = []
    for relative in cases["files"]:
        path = destination / relative
        case = yaml.safe_load(path.read_text())
        ids.append(case.get("id", path.stem))
        judge = case.get("judge", config.get("judge", {}))
        if judge.get("type") == "agent_judge":
            judge["model"] = model
            judge.pop("engine", None)
            judge.setdefault("timeout_seconds", 180)
        path.chmod(path.stat().st_mode | 0o200)
        path.write_text(yaml.safe_dump(case, allow_unicode=True, sort_keys=False))
    entry.chmod(entry.stat().st_mode | 0o200)
    entry.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
    return ids


def evaluate(skill_up: Path, assembled: Path, output: Path, env: dict[str, str],
             timeout: int, should_stop: Callable[[], bool] = lambda: False,
             lease_file: Path | None = None) -> int:
    output.mkdir(parents=True, exist_ok=True)
    check_sandbox(output, env, should_stop, lease_file)
    empty_config = output / "skill-up-config.yaml"
    empty_config.write_text("{}\n")
    base = [str(skill_up.resolve()), "--config", str(empty_config.resolve())]
    entry = str((assembled / "evals/eval.yaml").resolve())
    code = run_process(base + ["validate", entry], assembled, env, output / "validate.log", 30)
    if code:
        raise EngineError("Whole-suite validation failed; see validate.log")
    return run_process(base + ["run", entry, "--output-dir", str(output.resolve()),
                              "--format", "json", "--format", "html", "--parallelism", "1",
                              "--event-log", str((output / "events.jsonl").resolve())],
                       assembled, env, output / "execution.log", timeout, should_stop, lease_file)
