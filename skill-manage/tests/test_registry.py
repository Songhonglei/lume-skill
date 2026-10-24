import hashlib

from fastapi.testclient import TestClient

from conftest import PASSWORD, login, package, upload


def test_register_download_files_and_reuse(client):
    raw = package(prefix="archive-main/")
    first = upload(client, raw).json()
    assert first["reused"] is False
    second = upload(client, package()).json()
    assert second["version_id"] == first["version_id"] and second["reused"]
    version = first["version_id"]
    response = client.get(f"/api/versions/{version}/download")
    assert response.content == raw
    assert response.headers["x-artifact-sha256"] == hashlib.sha256(raw).hexdigest()
    assert client.get(f"/api/versions/{version}/files").json()[0]["path"] == "SKILL.md"
    assert (
        "# Example"
        in client.get(f"/api/versions/{version}/file", params={"path": "SKILL.md"}).json()["content"]
    )
    assert (
        client.get(f"/api/versions/{version}/file", params={"path": "../../registry.db"}).status_code == 404
    )
    assert upload(client, package(extra={"change.txt": b"different"})).status_code == 409


def test_version_pointer_is_explicit(client):
    first = upload(client).json()
    second = upload(client, package(version="2.0.0")).json()
    skill_id = first["skill_id"]
    assert client.get(f"/api/skills/{skill_id}").json()["current_version_id"] == first["version_id"]
    assert (
        client.put(f"/api/skills/{skill_id}/current", json={"version_id": second["version_id"]}).status_code
        == 200
    )
    foreign = upload(client, package(name="other-skill")).json()
    assert (
        client.put(f"/api/skills/{skill_id}/current", json={"version_id": foreign["version_id"]}).status_code
        == 400
    )


def test_directory_and_missing_metadata(client):
    response = client.post(
        "/api/import/directory",
        files=[
            ("files", ("dir/SKILL.md", b"# Plain Skill")),
            ("files", ("dir/references/README.md", b"Read me")),
        ],
    )
    assert response.json()["needs_metadata"] == ["name", "version"]
    response = client.post(
        "/api/import/directory",
        files=[("files", ("dir/SKILL.md", b"# Plain Skill"))],
        data={"name": "plain", "version": "1"},
    )
    assert response.status_code == 200 and response.json()["version_id"]


def test_flawed_metadata_is_registrable_without_audit(client):
    raw = package(extra={"SKILL.md": b"---\nname: [\n---\n# Broken YAML"})
    assert upload(client, raw).json()["needs_metadata"] == ["name", "version"]
    assert upload(client, raw, name="broken", version="1").json()["version_id"]
    invalid_name = package(name="Friendly Name")
    assert upload(client, invalid_name).json()["needs_metadata"] == ["name"]
    assert upload(client, invalid_name, name="friendly-name").json()["version_id"]


def test_permissions_and_disabled_sessions(client):
    skill = upload(client).json()
    user = client.post(
        "/api/users", json={"username": "member", "password": PASSWORD, "role": "maintainer"}
    ).json()
    with TestClient(client.app) as member:
        login(member, "member")
        assert member.get("/api/skills").status_code == 200
        assert member.get("/api/users").status_code == 403
        assert (
            member.post("/api/users", json={"username": "intruder", "password": PASSWORD}).status_code == 403
        )
        assert upload(member).status_code == 403
        assert (
            member.put(
                f"/api/skills/{skill['skill_id']}/current", json={"version_id": skill["version_id"]}
            ).status_code
            == 403
        )
        owned = upload(member, package(name="owned")).json()
        assert owned["version_id"]
        assert (
            member.put(f"/api/skills/{skill['skill_id']}/owner", json={"owner_id": user["id"]}).status_code
            == 403
        )
        assert (
            client.put(f"/api/skills/{skill['skill_id']}/owner", json={"owner_id": user["id"]}).status_code
            == 200
        )
        assert upload(member, package(version="2")).status_code == 200
        assert client.patch(f"/api/users/{user['id']}", json={"active": False}).status_code == 200
        assert member.get("/api/me").status_code == 401


def test_plain_text_preview_cannot_inject_html(client):
    data = upload(client, package(extra={"page.html": b"<script>alert(1)</script>"})).json()
    response = client.get(f"/api/versions/{data['version_id']}/file", params={"path": "page.html"})
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["content"].startswith("<script>")


def test_url_registration_uses_immutable_bytes(client, monkeypatch):
    raw = package(name="from-url")
    monkeypatch.setattr("skill_mng.app.fetch_package", lambda url: raw)
    result = client.post("/api/import/url", json={"url": "https://public.example/skill.zip"}).json()
    assert client.get(f"/api/versions/{result['version_id']}/download").content == raw
