import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from skill_mng.app import create_app

PASSWORD = "synthetic-pass-1234"


def package(name="hello-skill", version="1.0.0", extra=None, prefix=""):
    files = {
        "SKILL.md": f"---\nname: {name}\nversion: {version}\ndescription: Synthetic fixture\n---\n# Example\n".encode(),
        **(extra or {}),
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            archive.writestr(prefix + path, content)
    return output.getvalue()


def login(client, username="admin", password=PASSWORD):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = response.json()["csrf"]
    return response.json()


def upload(client, raw=None, **metadata):
    return client.post(
        "/api/import/upload",
        files={"file": ("skill.zip", raw or package(), "application/zip")},
        data=metadata,
    )


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        token = (tmp_path / "run/setup-code").read_text()
        response = client.post(
            "/api/onboard", json={"token": token, "username": "admin", "password": PASSWORD}
        )
        assert response.status_code == 200, response.text
        login(client)
        yield client
