import hashlib
import json
import os
import platform
import re
import subprocess
import tomllib
from pathlib import Path

from worker.engine import CODEX_VERSION, SKILL_UP_VERSION


def detect(skill_up: Path, codex_home: Path) -> dict:
    versions = {}
    environment = {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}
    for name, command in (("skill_up_version", [str(skill_up), "--version"]), ("codex_version", ["codex", "--version"])):
        try:
            result = subprocess.run(command, capture_output=True, text=True, env=environment, timeout=10, check=False)
            found = re.fullmatch(r"(?:skill-up version|codex-cli) (\S+)", result.stdout.strip())
            versions[name] = found.group(1) if result.returncode == 0 and found else ""
        except (OSError, subprocess.TimeoutExpired):
            versions[name] = ""
    connection, diagnostic, configured = {}, "", False
    try:
        file = codex_home / "config.toml"
        config = tomllib.loads(file.read_text()) if file.exists() else {}
        provider = config.get("model_provider", "openai")
        details = config.get("model_providers", {}).get(provider, {})
        connection = {"provider": provider, **{key: details.get(key) for key in ("name", "base_url", "wire_api", "env_key", "requires_openai_auth")}}
        configured = (codex_home / "auth.json").is_file() or bool(details.get("env_key") and os.environ.get(details["env_key"]))
    except (OSError, ValueError, TypeError):
        diagnostic = "Codex 连接配置无法读取，请检查所选登录目录"
    if versions["skill_up_version"] != SKILL_UP_VERSION:
        diagnostic = f"需要 skill-up {SKILL_UP_VERSION}；请使用 Worker 随附的安装入口"
    elif versions["codex_version"] != CODEX_VERSION:
        diagnostic = f"需要 Codex {CODEX_VERSION}；不会自动替换系统安装"
    elif not configured:
        diagnostic = "未检测到 Codex 登录，请先在这个 Worker 上运行 codex login"
    return {**versions, "login_configured": configured,
            "connection_fingerprint": hashlib.sha256(json.dumps(connection, sort_keys=True).encode()).hexdigest() if connection else "",
            "connection_label": str(connection.get("name") or connection.get("provider") or "Codex")[:100],
            "platform": f"{platform.system()} {platform.machine()}", "diagnostic": diagnostic}
