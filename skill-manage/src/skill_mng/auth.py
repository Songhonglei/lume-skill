import hashlib
import hmac
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .db import transaction


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def hash_password(password: str) -> str:
    if not 12 <= len(password) <= 256:
        raise ValueError("密码请使用 12–256 个字符")
    salt = secrets.token_bytes(16)
    result = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${result.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    if len(password) > 256:
        return False
    _, salt, expected = encoded.split("$")
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return hmac.compare_digest(actual.hex(), expected)


def create_user(db, username: str, password: str, role: str) -> dict:
    if not username or len(username) > 64 or username != username.strip():
        raise ValueError("账号需为 1–64 个字符，首尾不能有空格")
    user_id = new_id()
    db.execute(
        "INSERT INTO users VALUES (?,?,?,?,1,?)", (user_id, username, hash_password(password), role, now())
    )
    return {"id": user_id, "username": username, "role": role, "active": 1}


def bootstrap_token(root: Path) -> str | None:
    """Keep only a verifier in SQLite; a local restricted file carries the first-use code."""
    with transaction(root, write=True) as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return None
        path = root / "run/setup-code"
        stored = db.execute("SELECT value FROM settings WHERE key='setup_token_hash'").fetchone()
        if stored and path.exists():
            token = path.read_text().strip()
            if hmac.compare_digest(digest(token), stored[0]):
                return token
        token = secrets.token_urlsafe(32)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(token)
        db.execute("INSERT OR REPLACE INTO settings VALUES ('setup_token_hash',?)", (digest(token),))
        return token


def initialize(root: Path, token: str, username: str, password: str) -> bool:
    with transaction(root, write=True) as db:
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return False
        row = db.execute("SELECT value FROM settings WHERE key='setup_token_hash'").fetchone()
        if not row or not hmac.compare_digest(row[0], digest(token)):
            raise PermissionError("初始化凭据无效，请从服务器本地读取 setup-code")
        create_user(db, username, password, "admin")
        db.execute("DELETE FROM settings WHERE key='setup_token_hash'")
    (root / "run/setup-code").unlink(missing_ok=True)
    return True


def make_session(db, user_id: str) -> tuple[str, str]:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    db.execute(
        "INSERT INTO sessions VALUES (?,?,?,?)", (digest(token), user_id, csrf, int(time.time()) + 86400)
    )
    return token, csrf
