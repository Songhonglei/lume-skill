import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.api import create_app
from backend.config import Settings


@pytest.fixture
def client(tmp_path):
    url = os.environ.get("OSE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set OSE_TEST_DATABASE_URL to an isolated PostgreSQL database")
    schema = "test_" + uuid4().hex
    with psycopg.connect(url, autocommit=True) as connection:
        connection.execute(psycopg.sql.SQL("CREATE SCHEMA {}").format(psycopg.sql.Identifier(schema)))
    isolated_url = psycopg.conninfo.make_conninfo(url, options=f"-csearch_path={schema}")
    app = create_app(Settings(database_url=isolated_url, data_dir=tmp_path / "data",
                              skill_up=Path(".local/bin/skill-up").resolve()))
    try:
        with TestClient(app, base_url="http://127.0.0.1:8765") as client:
            client.headers["Origin"] = "http://127.0.0.1:8765"
            yield client
    finally:
        with psycopg.connect(url, autocommit=True) as connection:
            connection.execute(psycopg.sql.SQL("DROP SCHEMA {} CASCADE").format(psycopg.sql.Identifier(schema)))


@pytest.fixture
def admin(client):
    result = client.post("/api/setup", json={"password": "synthetic-password-123"})
    assert result.status_code == 200, result.text
    client.headers["X-CSRF-Token"] = result.json()["csrf_token"]
    return client
