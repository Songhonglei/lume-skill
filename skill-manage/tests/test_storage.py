import json
import sqlite3
import zipfile

import pytest

from conftest import upload
from skill_mng.backup import backup, restore
from skill_mng.db import SCHEMA_VERSION, migrate, transaction


def test_migrations_idempotent_and_forward_only(tmp_path):
    migrate(tmp_path)
    migrate(tmp_path)
    with transaction(tmp_path, write=True) as db:
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert db.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert db.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        db.execute("PRAGMA user_version=999")
    with pytest.raises(RuntimeError, match="更高版本"):
        migrate(tmp_path)


def test_backup_restore_and_sessions_invalidated(client, tmp_path):
    data = upload(client).json()
    source = client.app.state.root
    destination = tmp_path / "snapshot.zip"
    # pytest's tmp_path is the fixture parent of the registry, so use a sibling backup file.
    destination = source.parent / (source.name + "-snapshot.zip")
    backup(source, destination)
    target = source.parent / (source.name + "-restored")
    result = restore(destination, target)
    assert result["artifacts"] == 1
    with transaction(target) as db:
        assert db.execute("SELECT id FROM versions").fetchone()[0] == data["version_id"]
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
    with pytest.raises(ValueError, match="空"):
        restore(destination, target)
    destination.unlink()


def test_tampered_backup_and_path_escape_do_not_restore(client):
    source = client.app.state.root
    destination = source.parent / (source.name + "-tamper.zip")
    backup(source, destination)
    with zipfile.ZipFile(destination) as archive:
        members = {name: archive.read(name) for name in archive.namelist()}
    members["registry.db"] = b"changed"
    with zipfile.ZipFile(destination, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    target = source.parent / (source.name + "-rejected")
    with pytest.raises(ValueError, match="摘要"):
        restore(destination, target)
    assert not target.exists()
    members = {
        "../escape": b"bad",
        "manifest.json": json.dumps({"format": 1, "hashes": {"../escape": "x"}}).encode(),
    }
    with zipfile.ZipFile(destination, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    with pytest.raises(ValueError):
        restore(destination, target)
    assert not target.exists() and not (source.parent / "escape").exists()
    destination.unlink()


def test_foreign_keys_enforced(tmp_path):
    migrate(tmp_path)
    with pytest.raises(sqlite3.IntegrityError), transaction(tmp_path, write=True) as db:
        db.execute("INSERT INTO sessions VALUES ('x','missing','csrf',1)")
