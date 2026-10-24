from fastapi.testclient import TestClient

from conftest import PASSWORD, login, package
from skill_mng.db import transaction


def test_url_metadata_completion_preserves_first_download(client, monkeypatch):
    first = package(extra={"SKILL.md": b"# Missing metadata"})
    downloads = []

    def fetch(url):
        downloads.append(url)
        return first if len(downloads) == 1 else package(extra={"changed": b"not authorized"})

    monkeypatch.setattr("skill_mng.app.fetch_package", fetch)
    pending = client.post("/api/import/url", json={"url": "https://public.example/pkg.zip"}).json()
    assert pending["needs_metadata"] == ["name", "version"]
    body = {"import_token": pending["import_token"], "name": "frozen", "version": "1"}
    result = client.post("/api/import/complete", json=body).json()
    assert result["version_id"] and len(downloads) == 1
    assert client.get(f"/api/versions/{result['version_id']}/download").content == first
    assert client.post("/api/import/complete", json=body).json() == result


def test_import_token_owner_and_expiration(client, monkeypatch):
    monkeypatch.setattr("skill_mng.app.fetch_package", lambda url: package(extra={"SKILL.md": b"# Plain"}))
    pending = client.post("/api/import/url", json={"url": "https://public.example/pkg.zip"}).json()
    client.post("/api/users", json={"username": "member", "password": PASSWORD})
    body = {"import_token": pending["import_token"], "name": "frozen", "version": "1"}
    with TestClient(client.app) as other:
        login(other, "member")
        assert other.post("/api/import/complete", json=body).status_code == 403
    with transaction(client.app.state.root, write=True) as db:
        db.execute("UPDATE import_drafts SET expires_at=0")
    assert client.post("/api/import/complete", json=body).status_code == 400
