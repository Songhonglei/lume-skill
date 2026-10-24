import io
import socket
import threading

import pytest

from skill_mng.fetch import PinnedHTTP, fetch_package
from skill_mng.packages import MAX_PACKAGE


class Response:
    status = 200

    def __init__(self, content=b"PK bytes", headers=None):
        self.content = io.BytesIO(content)
        self.headers = headers or {}

    def getheader(self, name):
        return self.headers.get(name)

    def read1(self, count):
        return self.content.read(count)


def wire(monkeypatch, response):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [(2, 1, 6, "", ("93.184.216.34", 443))])
    monkeypatch.setattr(PinnedHTTP, "request", lambda *a, **kw: None)
    monkeypatch.setattr(PinnedHTTP, "getresponse", lambda self: response)


def test_download_exact_bytes_and_oversize_declaration(monkeypatch):
    wire(monkeypatch, Response(b"original archive bytes"))
    assert fetch_package("https://public.example/file.zip") == b"original archive bytes"
    wire(monkeypatch, Response(headers={"Content-Length": str(MAX_PACKAGE + 1)}))
    with pytest.raises(ValueError, match="超过"):
        fetch_package("https://public.example/file.zip")


def test_unannounced_large_stream_and_http_failure(monkeypatch):
    wire(monkeypatch, Response(b"x" * (MAX_PACKAGE + 1)))
    with pytest.raises(ValueError, match="超过"):
        fetch_package("https://public.example/file.zip")
    response = Response()
    response.status = 404
    wire(monkeypatch, response)
    with pytest.raises(ValueError, match="HTTP 404"):
        fetch_package("https://public.example/file.zip")


def test_total_timeout_interrupts_continuous_headers(monkeypatch):
    wire(monkeypatch, Response())
    stopped = threading.Event()

    class Socket:
        def shutdown(self, how):
            stopped.set()

        def close(self):
            pass

    def request(self, *args, **kwargs):
        self.sock = Socket()

    def delayed_response(self):
        assert stopped.wait(1)
        return Response()

    monkeypatch.setattr("skill_mng.fetch.DOWNLOAD_TIMEOUT", 0.03)
    monkeypatch.setattr(PinnedHTTP, "request", request)
    monkeypatch.setattr(PinnedHTTP, "getresponse", delayed_response)
    with pytest.raises(ValueError, match="超时"):
        fetch_package("https://public.example/file.zip")
