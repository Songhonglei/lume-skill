import hashlib
import json
from uuid import uuid4

from fastapi import HTTPException, Request
from psycopg.types.json import Jsonb


def new_id() -> str:
    return str(uuid4())


def digest(value: bytes | str) -> str:
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def jsonb(value) -> Jsonb:
    return Jsonb(json.loads(canonical(value)))


def db_connection(request: Request):
    with request.app.state.database.connection() as connection:
        yield connection


def required(row, message="资源不存在"):
    if row is None:
        raise HTTPException(404, message)
    return row


def setting(connection, key, default=None):
    row = connection.execute("SELECT value FROM settings WHERE key=%s", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(connection, key, value):
    connection.execute("INSERT INTO settings(key,value) VALUES(%s,%s) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                       (key, jsonb(value)))
