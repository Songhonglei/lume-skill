def test_setup_session_csrf_and_password_rotation(client):
    assert client.get("/api/skills").status_code == 401
    setup = client.post("/api/setup", json={"password": "synthetic-password-123"})
    assert setup.status_code == 200
    csrf = setup.json()["csrf_token"]
    assert client.post("/api/setup", json={"password": "synthetic-password-123"}).status_code == 409
    assert client.post("/api/settings/password", json={"password": "synthetic-password-456"}).status_code == 403
    client.headers["X-CSRF-Token"] = csrf
    client.headers["Origin"] = "https://untrusted.invalid"
    assert client.post("/api/settings/password", json={"password": "synthetic-password-456"}).status_code == 403
    client.headers["Origin"] = "http://127.0.0.1:8765"
    changed = client.post("/api/settings/password", json={"password": "synthetic-password-456"})
    assert changed.status_code == 200
    client.headers["X-CSRF-Token"] = changed.json()["csrf_token"]
    assert client.delete("/api/session").status_code == 200
    assert client.post("/api/session", json={"password": "synthetic-password-123"}).status_code == 401
    assert client.post("/api/session", json={"password": "synthetic-password-456"}).status_code == 200


def test_failed_logins_are_persistently_limited(admin):
    for _ in range(10):
        assert admin.post("/api/session", json={"password": "wrong"}).status_code == 401
    assert admin.post("/api/session", json={"password": "synthetic-password-123"}).status_code == 429
