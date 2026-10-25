import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_worker_retains_container_and_codex_sandbox_boundaries():
    worker = yaml.safe_load((ROOT / "compose.yaml").read_text())["services"]["worker"]
    assert worker["cap_drop"] == ["ALL"]
    assert not worker.get("cap_add") and not worker.get("privileged")
    assert "no-new-privileges:true" in worker["security_opt"]
    assert "seccomp=./deploy/worker-seccomp.json" in worker["security_opt"]
    assert not any("unconfined" in item for item in worker["security_opt"])
    assert not any("docker.sock" in item or ":/root" in item for item in worker["volumes"])
    assert "USER 10001:10001" in (ROOT / "Dockerfile").read_text().split("FROM runtime AS worker", 1)[1]


def test_seccomp_is_finite_and_keeps_sensitive_syscalls_blocked_without_capabilities():
    profile = json.loads((ROOT / "deploy/worker-seccomp.json").read_text())
    assert profile["defaultAction"] == "SCMP_ACT_ERRNO"
    allowed = {name for rule in profile["syscalls"]
               if rule["action"] == "SCMP_ACT_ALLOW" and not rule.get("includes", {}).get("caps")
               for name in rule["names"]}
    assert {"unshare", "mount", "pivot_root", "setns"} <= allowed
    assert not {"bpf", "keyctl", "open_by_handle_at", "io_uring_setup", "kexec_load"} & allowed
