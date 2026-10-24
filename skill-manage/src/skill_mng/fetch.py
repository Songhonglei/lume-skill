"""Pinned public-address HTTP(S) downloader; no environment proxy or DNS rebinding window."""

import http.client
import ipaddress
import socket
import ssl
import threading
import time
from urllib.parse import urljoin, urlsplit

from .packages import MAX_PACKAGE

DOWNLOAD_TIMEOUT = 30


def public_target(url: str) -> tuple[str, str, int, list[str]]:
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("只支持不含凭据的公开 HTTP(S) 下载链接")
    if parsed.fragment or len(url) > 2048 or any(ord(c) < 33 for c in url):
        raise ValueError("下载链接格式不正确")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise ValueError("下载地址端口不正确") from exc
    if port not in (80, 443):
        raise ValueError("下载链接仅支持 80/443 端口")
    host = parsed.hostname.encode("idna").decode("ascii")
    addresses = list(
        dict.fromkeys(row[4][0] for row in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM))
    )
    if not addresses:
        raise ValueError("下载域名无法解析")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global or ip.is_multicast or getattr(ip, "ipv4_mapped", None):
            raise ValueError("下载链接不能指向本机、内网或保留地址")
        if isinstance(ip, ipaddress.IPv6Address) and (
            ip.sixtofour or ip.teredo or ip.scope_id or ip in ipaddress.ip_network("64:ff9b::/96")
        ):
            raise ValueError("下载链接不能使用 IPv6 隧道或地址转换网段")
    return parsed.scheme, host, port, addresses


class PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, address: str, secure: bool):
        super().__init__(host, port, timeout=8)
        self.address, self.secure = address, secure

    def connect(self):
        sock = socket.create_connection((self.address, self.port), timeout=self.timeout)
        if self.secure:
            try:
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=self.host)
            except BaseException:
                sock.close()
                raise
        self.sock = sock


def fetch_package(url: str) -> bytes:
    deadline = time.monotonic() + DOWNLOAD_TIMEOUT
    try:
        for _ in range(6):
            scheme, host, port, addresses = public_target(url)
            if time.monotonic() > deadline:
                raise ValueError("下载超时，请下载后本地上传")
            parsed = urlsplit(url)
            connection = PinnedHTTP(host, port, addresses[0], scheme == "https")
            timer = None
            timed_out = threading.Event()
            try:
                target = parsed.path or "/"
                if parsed.query:
                    target += "?" + parsed.query
                connection.request(
                    "GET", target, headers={"User-Agent": "open-skill-mng/0.1", "Accept": "application/zip"}
                )
                transport = connection.sock

                def abort_transfer(transport=transport, timed_out=timed_out):
                    timed_out.set()
                    if transport:
                        try:
                            transport.shutdown(socket.SHUT_RDWR)
                        except OSError:
                            pass

                # Socket inactivity timeouts alone do not stop slow, continuously trickling headers.
                timer = threading.Timer(max(0, deadline - time.monotonic()), abort_transfer)
                timer.daemon = True
                timer.start()
                response = connection.getresponse()
                if timed_out.is_set():
                    raise ValueError("下载超时，请下载后本地上传")
                if response.status in (301, 302, 303, 307, 308):
                    location = response.getheader("Location")
                    if not location:
                        raise ValueError("下载重定向缺少地址")
                    url = urljoin(url, location)
                    continue
                if response.status != 200:
                    raise ValueError(f"下载服务返回 HTTP {response.status}")
                length = response.getheader("Content-Length")
                if length and (not length.isdigit() or int(length) > MAX_PACKAGE):
                    raise ValueError("下载包超过 16 MiB 或大小声明无效")
                output = bytearray()
                while True:
                    if time.monotonic() > deadline:
                        raise ValueError("下载超时，请下载后本地上传")
                    block = response.read1(min(65536, MAX_PACKAGE + 1 - len(output)))
                    if timed_out.is_set() or time.monotonic() > deadline:
                        raise ValueError("下载超时，请下载后本地上传")
                    if not block:
                        return bytes(output)
                    output.extend(block)
                    if len(output) > MAX_PACKAGE:
                        raise ValueError("下载包超过 16 MiB")
            finally:
                if timer:
                    timer.cancel()
                connection.close()
    except (OSError, http.client.HTTPException, UnicodeError) as exc:
        raise ValueError("无法安全下载该地址，请检查链接或改用本地上传") from exc
    raise ValueError("下载重定向次数过多")
