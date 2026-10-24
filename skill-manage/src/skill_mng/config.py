"""One data layout for native and container installs."""

import json
import os
import secrets
from pathlib import Path


def data_path(value: str | Path | None = None) -> Path:
    return Path(value or os.environ.get("SKILL_MNG_DATA", "~/.local/share/skill-mng")).expanduser().resolve()


def prepare(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ("objects", "run", "tmp"):
        (root / name).mkdir(exist_ok=True, mode=0o700)


def read_config(root: Path) -> dict:
    path = root / "config.json"
    config = json.loads(path.read_text()) if path.exists() else {"host": "127.0.0.1", "port": 8765}
    config["host"] = os.environ.get("SKILL_MNG_HOST", config["host"])
    if os.environ.get("SKILL_MNG_PUBLIC_URL"):
        from urllib.parse import urlsplit

        public_url = os.environ["SKILL_MNG_PUBLIC_URL"].rstrip("/")
        parsed = urlsplit(public_url)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.username
        ):
            raise ValueError("SKILL_MNG_PUBLIC_URL 需为完整 HTTP(S) 站点地址，不含路径或凭据")
        config["public_url"] = public_url
    return config


def write_config(root: Path, config: dict) -> None:
    prepare(root)
    temp = root / "config.json.tmp"
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        json.dump(config, handle, indent=2)
    temp.replace(root / "config.json")


def write_secret_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + "." + secrets.token_hex(8))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as handle:
            json.dump(value, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
