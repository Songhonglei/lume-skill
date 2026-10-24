import fcntl
import json
import os
from contextlib import contextmanager
from pathlib import Path

from .auth import new_id, now
from .db import transaction
from .packages import SLUG, VERSION, Package, manifest_json


@contextmanager
def storage_lock(root: Path):
    with (root / "run/storage.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def may_write(user: dict, skill) -> bool:
    return user["role"] == "admin" or user["id"] == skill["owner_id"]


def record_event(db, actor: str, kind: str, subject: str, detail: dict | None = None):
    db.execute(
        "INSERT INTO events(actor_id,kind,subject_id,detail_json,created_at) VALUES (?,?,?,?,?)",
        (actor, kind, subject, json.dumps(detail or {}), now()),
    )


def register(root: Path, user: dict, package: Package, *, slug: str = "", version: str = "") -> dict:
    explicit_slug, explicit_version = bool(slug.strip()), bool(version.strip())
    slug = slug.strip() or package.metadata.get("name", "")
    version = version.strip() or package.metadata.get("version", "")
    if explicit_slug and not SLUG.fullmatch(slug):
        raise ValueError("名称请用小写字母、数字或连字符，最多 80 字符")
    if explicit_version and not VERSION.fullmatch(version):
        raise ValueError("版本请用字母、数字及 . _ + -，最多 80 字符")
    missing = [
        key
        for key, value, pattern in (("name", slug, SLUG), ("version", version, VERSION))
        if not pattern.fullmatch(value)
    ]
    if missing:
        return {"needs_metadata": missing, "metadata": package.metadata}
    with storage_lock(root), transaction(root, write=True) as db:
        return register_in_transaction(db, root, user, package, slug, version)


def register_in_transaction(db, root, user, package, slug, version, *, version_id=None):
    """Caller holds storage lock and one write transaction; allows an atomic repair Gate."""
    if not SLUG.fullmatch(slug) or not VERSION.fullmatch(version):
        raise ValueError("名称或版本格式无效")
    skill = db.execute("SELECT * FROM skills WHERE slug=?", (slug,)).fetchone()
    if skill and not may_write(user, skill):
        raise PermissionError("仅维护者或管理员可为此 Skill 登记版本")
    if skill:
        existing = db.execute(
            "SELECT * FROM versions WHERE skill_id=? AND version=?", (skill["id"], version)
        ).fetchone()
        if existing:
            if existing["content_digest"] != package.content_digest:
                raise FileExistsError("此版本已有不同内容，请更换版本号；原版本不会被覆盖")
            return {"skill_id": skill["id"], "version_id": existing["id"], "reused": True}
    artifact = db.execute("SELECT id FROM artifacts WHERE digest=?", (package.artifact_digest,)).fetchone()
    artifact_id = artifact[0] if artifact else new_id()
    path = root / "objects" / (package.artifact_digest + ".zip")
    if not artifact:
        # Atomic immutable blob; an interrupted transaction may leave an unreferenced blob, never partial bytes.
        temp = root / "tmp" / new_id()
        try:
            fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(package.raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)
        db.execute(
            "INSERT INTO artifacts VALUES (?,?,?,?,?)",
            (artifact_id, package.artifact_digest, len(package.raw), "application/zip", now()),
        )
    skill_id = skill["id"] if skill else new_id()
    if not skill:
        db.execute(
            "INSERT INTO skills(id,slug,name,description,owner_id,created_at) VALUES (?,?,?,?,?,?)",
            (
                skill_id,
                slug,
                package.metadata.get("name", slug),
                package.metadata.get("description", ""),
                user["id"],
                now(),
            ),
        )
    version_id = version_id or new_id()
    db.execute(
        "INSERT INTO versions VALUES (?,?,?,?,?,?,?,?)",
        (
            version_id,
            skill_id,
            version,
            package.content_digest,
            artifact_id,
            manifest_json(package),
            user["id"],
            now(),
        ),
    )
    if not skill:
        db.execute("UPDATE skills SET current_version_id=? WHERE id=?", (version_id, skill_id))
    record_event(db, user["id"], "version.registered", version_id, {"content_digest": package.content_digest})
    return {"skill_id": skill_id, "version_id": version_id, "reused": False}
