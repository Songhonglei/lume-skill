"""Consistent snapshots: serialize blob registration, SQLite backup API, checked restore."""

import hashlib
import json
import re
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path

from .config import prepare, read_config, write_config
from .db import SCHEMA_VERSION, connect
from .packages import safe_path
from .registry import storage_lock


def backup(root: Path, destination: Path) -> dict:
    destination = destination.expanduser().resolve()
    if destination.is_relative_to(root):
        raise ValueError("备份请保存在数据目录之外")
    if destination.exists():
        raise FileExistsError("备份文件已存在，请换一个文件名")
    prepare(root)
    if not (root / "registry.db").exists():
        raise ValueError("数据目录尚未初始化")
    with tempfile.TemporaryDirectory(dir=root / "tmp") as temp, storage_lock(root):
        snapshot_path = Path(temp) / "registry.db"
        source, snapshot = connect(root), sqlite3.connect(snapshot_path)
        try:
            source.backup(snapshot)
            objects = [row[0] for row in snapshot.execute("SELECT digest FROM artifacts")]
        finally:
            snapshot.close()
            source.close()
        hashes = {"registry.db": hashlib.sha256(snapshot_path.read_bytes()).hexdigest()}
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            with destination.open("xb") as handle:
                destination.chmod(0o600)
                with zipfile.ZipFile(handle, "w", zipfile.ZIP_DEFLATED) as archive:
                    archive.write(snapshot_path, "registry.db")
                    for digest in objects:
                        content = (root / "objects" / (digest + ".zip")).read_bytes()
                        if hashlib.sha256(content).hexdigest() != digest:
                            raise ValueError("原包校验失败，备份已停止")
                        name = f"objects/{digest}.zip"
                        archive.writestr(name, content)
                        hashes[name] = digest
                    archive.writestr(
                        "manifest.json",
                        json.dumps(
                            {
                                "format": 1,
                                "hashes": hashes,
                                "config": {
                                    k: v for k, v in read_config(root).items() if k in ("host", "port")
                                },
                            }
                        ),
                    )
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
    return {"path": str(destination), "artifacts": len(objects)}


def restore(source: Path, target: Path) -> dict:
    if target.exists() and any(target.iterdir()):
        raise ValueError("只允许恢复到不存在或空的数据目录；请先停止服务并另选空目录")
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".skill-mng-restore-", dir=target.parent))
    try:
        with zipfile.ZipFile(source) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or "manifest.json" not in names:
                raise ValueError("备份成员不完整或重复")
            if archive.getinfo("manifest.json").file_size > 4 * 1024 * 1024:
                raise ValueError("备份清单过大")
            manifest = json.loads(archive.read("manifest.json"))
            hashes = manifest["hashes"]
            if manifest.get("format") != 1 or set(names) != set(hashes) | {"manifest.json"}:
                raise ValueError("备份格式或清单不匹配")
            for name, expected in hashes.items():
                safe_path(name)
                if name != "registry.db" and not re.fullmatch(r"objects/[a-f0-9]{64}\.zip", name):
                    raise ValueError("备份包含未知成员")
                path = staging / name
                path.parent.mkdir(parents=True, exist_ok=True)
                calculated = hashlib.sha256()
                with archive.open(name) as member, path.open("xb") as output:
                    while block := member.read(65536):
                        calculated.update(block)
                        output.write(block)
                path.chmod(0o600)
                if calculated.hexdigest() != expected:
                    raise ValueError("备份摘要校验失败")
        db = sqlite3.connect(staging / "registry.db")
        try:
            if (
                db.execute("PRAGMA quick_check").fetchone()[0] != "ok"
                or db.execute("PRAGMA foreign_key_check").fetchone()
            ):
                raise ValueError("备份数据库完整性校验失败")
            if db.execute("PRAGMA user_version").fetchone()[0] != SCHEMA_VERSION:
                raise ValueError("备份版本不同，请用对应版本恢复后再升级")
            expected_objects = {f"objects/{row[0]}.zip" for row in db.execute("SELECT digest FROM artifacts")}
            if expected_objects != set(hashes) - {"registry.db"}:
                raise ValueError("备份数据库和包清单不一致")
            db.execute(
                "UPDATE repair_runs SET state='cancelled',failure_code='restored_instance',finished_at=datetime('now') WHERE state NOT IN ('ready','published','needs_attention','cancelled','failed')"
            )
            db.execute("DELETE FROM sessions")
            db.execute("DELETE FROM import_drafts")
            # A restored instance must not trust old machines or resume old leases.
            db.execute("UPDATE workers SET revoked_at=datetime('now'),state='revoked'")
            db.execute("UPDATE worker_enrollments SET revoked_at=datetime('now')")
            db.execute(
                "UPDATE task_attempts SET state='expired',lease_until=0 WHERE state IN ('leased','running')"
            )
            db.execute(
                "UPDATE tasks SET state='cancelled',cancel_requested=1,failure_code='restored_instance' WHERE state NOT IN ('succeeded','failed','cancelled')"
            )
            db.execute(
                "UPDATE audit_runs SET verdict='error',delivery_status='failed' WHERE id IN (SELECT audit_run_id FROM tasks WHERE failure_code='restored_instance')"
            )
            db.commit()
        finally:
            db.close()
        write_config(staging, manifest.get("config", {"host": "127.0.0.1", "port": 8765}))
        if target.exists():
            target.rmdir()
        staging.rename(target)
        return {"data_dir": str(target), "artifacts": len(expected_objects)}
    except (KeyError, json.JSONDecodeError, zipfile.BadZipFile, sqlite3.DatabaseError) as exc:
        raise ValueError("备份格式无效或已损坏") from exc
    finally:
        if staging.exists():
            shutil.rmtree(staging)
