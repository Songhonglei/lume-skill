import os
import subprocess
import sys
from pathlib import Path

import pytest

from worker.engine import EngineError, check_sandbox, evaluate, run_process


def test_timeout_stops_grandchildren(tmp_path: Path):
    pidfile = tmp_path / "child.pid"
    script = ("import subprocess,time; p=subprocess.Popen(['sleep','90']);"
              f"open({str(pidfile)!r},'w').write(str(p.pid));time.sleep(90)")
    with pytest.raises(EngineError, match="timed out"):
        run_process([sys.executable, "-c", script], tmp_path, {"PATH": os.environ["PATH"]},
                    tmp_path / "run.log", 0.6)
    pid = int(pidfile.read_text())
    state = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], check=False, capture_output=True, text=True)
    assert state.returncode != 0 or state.stdout.strip().startswith("Z")


def test_linux_sandbox_failure_prevents_inference(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    codex = tmp_path / "codex"
    codex.write_text("#!/bin/sh\nprintf 'bwrap: devpts permission denied\\n' >&2\nexit 1\n")
    codex.chmod(0o755)
    marker = tmp_path / "model-started"
    skill_up = tmp_path / "skill-up"
    skill_up.write_text(f"#!/bin/sh\ntouch '{marker}'\n")
    skill_up.chmod(0o755)
    with pytest.raises(EngineError, match="尚未调用模型"):
        evaluate(skill_up, tmp_path / "assembled", tmp_path / "report", {"PATH": str(tmp_path)}, 60)
    assert not marker.exists()
    assert "devpts permission denied" in (tmp_path / "report/sandbox.log").read_text()


def test_linux_probe_uses_workspace_write_like_real_evaluation(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    calls = []

    def run(args, cwd, env, log, timeout, should_stop, lease_file):
        calls.append((args, cwd))
        return 0

    monkeypatch.setattr("worker.engine.run_process", run)
    check_sandbox(tmp_path, {"PATH": os.environ["PATH"]})
    args, workspace = calls[0]
    assert args[:5] == ["codex", "sandbox", "-c", 'sandbox_mode="workspace-write"', "--"]
    assert workspace == tmp_path / "sandbox-check"
    assert not any("bypass" in arg or "danger-full-access" in arg for arg in args)
