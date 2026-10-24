import io
import socket
import stat
import zipfile

import pytest
from fastapi.testclient import TestClient

from conftest import PASSWORD, package, upload
from skill_mng.app import MAX_REQUEST, create_app
from skill_mng.fetch import PinnedHTTP, fetch_package, public_target
from skill_mng.packages import MAX_FILE, inspect_package


@pytest.mark.parametrize(
    "path", ["../bad", "/absolute", "a/../../bad", "a\\bad", "C:/bad", "a/./bad", "a//bad", "a\x01bad"]
)
def test_unsafe_zip_paths(path):
    with pytest.raises(ValueError):
        inspect_package(package(extra={path: b"bad"}))


def test_symlink_duplicate_encrypted_and_size_limits():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("SKILL.md", "# Example")
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(link, "../outside")
    with pytest.raises(ValueError, match="符号链接"):
        inspect_package(output.getvalue())
    with pytest.raises(ValueError, match="重复"):
        inspect_package(package(extra={"skill.md": b"duplicate"}))
    with pytest.raises(ValueError, match="单文件"):
        inspect_package(package(extra={"bomb": b"0" * (MAX_FILE + 1)}))
    with pytest.raises(ValueError, match="SKILL.md"):
        inspect_package(package(extra={"SKILL.md": b"x" * 65537}))


def test_invalid_and_ambiguous_packages():
    with pytest.raises(ValueError):
        inspect_package(b"<html>A web page</html>")
    with pytest.raises(ValueError, match="SKILL.md"):
        inspect_package(package(prefix="root/").replace(b"SKILL.md", b"OTHER.md"))
    assert inspect_package(package(extra={"SKILL.md": b"---\nname: [\n---\n"})).metadata["parse_warning"]


def test_yaml_alias_and_deep_collection_do_not_expand():
    alias = b"---\nbase: &a {x: 1}\nexpand: &b {<<: [*a, *a]}\n---\n# Skill"
    deep = ("---\nname: " + "[" * 100 + "x" + "]" * 100 + "\n---\n").encode()
    for document in (alias, deep):
        assert inspect_package(package(extra={"SKILL.md": document})).metadata["parse_warning"]


def test_auth_csrf_origin_and_logout(client):
    csrf = client.headers.pop("x-csrf-token")
    assert upload(client).status_code == 403
    client.headers["x-csrf-token"] = csrf
    assert client.post("/api/logout", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/skills").status_code == 401


def test_onboard_single_use_and_login_limit(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        token = (tmp_path / "run/setup-code").read_text()
        body = {"token": "wrong", "username": "admin", "password": PASSWORD}
        assert client.post("/api/onboard", json=body).status_code == 403
        body["token"] = token
        assert client.post("/api/onboard", json=body).status_code == 200
        assert not (tmp_path / "run/setup-code").exists()
        assert client.post("/api/onboard", json=body).status_code == 409
        for _ in range(7):
            assert (
                client.post("/api/login", json={"username": "wrong", "password": PASSWORD}).status_code == 401
            )
        assert client.post("/api/login", json={"username": "wrong", "password": PASSWORD}).status_code == 429
        assert (
            client.post("/api/import/upload", headers={"Content-Length": str(MAX_REQUEST + 1)}).status_code
            == 413
        )


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "https://user:password@example.com/x",
        "http://127.0.0.1/x",
        "http://[::1]/x",
        "http://169.254.169.254/x",
        "http://10.0.0.1/x",
        "https://example.com:8443/x",
    ],
)
def test_ssrf_targets(url):
    with pytest.raises(ValueError):
        public_target(url)


def test_ipv6_translation_cannot_reach_loopback(monkeypatch):
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **kw: [(10, 1, 6, "", ("64:ff9b::7f00:1", 80, 0, 0))]
    )
    with pytest.raises(ValueError, match="地址转换"):
        public_target("http://public.example/x")


def test_mixed_dns_rejected_and_pinned_connection(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **kw: [(2, 1, 6, "", ("93.184.216.34", 443)), (2, 1, 6, "", ("127.0.0.1", 443))],
    )
    with pytest.raises(ValueError):
        public_target("https://example.com/package.zip")
    connected = []
    monkeypatch.setattr(
        socket, "create_connection", lambda target, **kw: connected.append(target) or object()
    )
    connection = PinnedHTTP("example.com", 80, "93.184.216.34", False)
    connection.connect()
    assert connected == [("93.184.216.34", 80)]


def test_redirect_to_private_rejected(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, *a, **kw: [
            (2, 1, 6, "", ("127.0.0.1" if host == "private.example" else "93.184.216.34", 80))
        ],
    )

    class FakeResponse:
        status = 302

        def getheader(self, name):
            return "http://private.example/skill.zip"

    monkeypatch.setattr(PinnedHTTP, "request", lambda *a, **kw: None)
    monkeypatch.setattr(PinnedHTTP, "getresponse", lambda self: FakeResponse())
    with pytest.raises(ValueError, match="内网"):
        fetch_package("http://public.example/package.zip")


def test_https_proxy_cookie_origin(client, monkeypatch):
    monkeypatch.setenv("SKILL_MNG_PUBLIC_URL", "https://skills.example.com")
    response = client.post(
        "/api/login",
        json={"username": "admin", "password": PASSWORD},
        headers={"Origin": "https://skills.example.com"},
    )
    assert response.status_code == 200 and "; Secure" in response.headers["set-cookie"]
