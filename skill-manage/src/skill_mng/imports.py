"""Freeze acquired bytes while the user supplies missing registration metadata."""

import hashlib
import json
import os
import secrets
import time
from pathlib import Path

from .auth import digest, new_id
from .db import transaction
from .packages import inspect_package
from .registry import register, storage_lock


def begin_import(root: Path, user: dict, raw: bytes, name: str = "", version: str = "") -> dict:
    package = inspect_package(raw)
    result = register(root, user, package, slug=name, version=version)
    if "needs_metadata" not in result:
        return result
    token, draft_id = secrets.token_urlsafe(32), new_id()
    path = root / "tmp" / ("import-" + draft_id + ".zip")
    with storage_lock(root), transaction(root, write=True) as db:
        current = int(time.time())
        expired = db.execute("SELECT id FROM import_drafts WHERE expires_at<?", (current,)).fetchall()
        db.execute("DELETE FROM import_drafts WHERE expires_at<?", (current,))
        for row in expired:
            (root / "tmp" / ("import-" + row[0] + ".zip")).unlink(missing_ok=True)
        count = db.execute(
            "SELECT count(*) FROM import_drafts WHERE created_by=? AND result_json IS NULL", (user["id"],)
        ).fetchone()[0]
        total = db.execute("SELECT count(*) FROM import_drafts WHERE result_json IS NULL").fetchone()[0]
        if count >= 5 or total >= 64:
            raise ValueError("待补填的导入较多，请先完成导入，或十分钟后重试")
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(raw)
            db.execute(
                "INSERT INTO import_drafts VALUES (?,?,?,?,?,NULL)",
                (draft_id, digest(token), user["id"], package.artifact_digest, current + 600),
            )
        except BaseException:
            path.unlink(missing_ok=True)
            raise
    return {**result, "import_token": token, "expires_in": 600}


def complete_import(root: Path, user: dict, token: str, name: str, version: str) -> dict:
    with transaction(root) as db:
        row = db.execute("SELECT * FROM import_drafts WHERE token_hash=?", (digest(token),)).fetchone()
    if not row or row["expires_at"] <= int(time.time()):
        raise ValueError("本次导入已过期，请重新选择包")
    if row["created_by"] != user["id"]:
        raise PermissionError("此导入属于其他账号")
    if row["result_json"]:
        return json.loads(row["result_json"])
    path = root / "tmp" / ("import-" + row["id"] + ".zip")
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        raise ValueError("临时包已清理，请重新导入") from None
    if hashlib.sha256(raw).hexdigest() != row["artifact_digest"]:
        raise ValueError("临时包内容已变化，请重新导入")
    result = register(root, user, inspect_package(raw), slug=name, version=version)
    if "needs_metadata" in result:
        return {**result, "import_token": token}
    with transaction(root, write=True) as db:
        db.execute(
            "UPDATE import_drafts SET result_json=? WHERE id=? AND result_json IS NULL",
            (json.dumps(result), row["id"]),
        )
        saved = db.execute("SELECT result_json FROM import_drafts WHERE id=?", (row["id"],)).fetchone()
    path.unlink(missing_ok=True)
    return json.loads(saved[0]) if saved else result
