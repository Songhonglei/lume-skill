import fcntl
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import prepare

SCHEMA_VERSION = 4


def connect(root: Path) -> sqlite3.Connection:
    db = sqlite3.connect(root / "registry.db", timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=10000")
    return db


@contextmanager
def transaction(root: Path, *, write: bool = False):
    db = connect(root)
    try:
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def migrate(root: Path) -> None:
    prepare(root)
    with (root / "run/migrate.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        db = connect(root)
        try:
            (root / "registry.db").chmod(0o600)
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError("数据库来自更高版本，请升级程序；禁止降级打开")
            db.execute("PRAGMA journal_mode=WAL")
            for number in range(version + 1, SCHEMA_VERSION + 1):
                path = next((Path(__file__).parent / "migrations").glob(f"{number:03d}_*.sql"))
                db.executescript(
                    f"BEGIN IMMEDIATE;\n{path.read_text()}\nPRAGMA user_version={number};\nCOMMIT;"
                )
        finally:
            db.close()
