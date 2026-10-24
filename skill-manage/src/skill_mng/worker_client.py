import ipaddress
import json
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class RequestFailure(RuntimeError):
    def __init__(self, status=0, code="network_error"):
        self.status, self.code = status, code
        super().__init__(code)


def server_url(value: str, *, internal=False) -> str:
    value = value.rstrip("/")
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.path
        or parsed.query
        or parsed.fragment
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("平台地址需为不含路径/凭据的 HTTP(S) 站点地址")
    try:
        loopback = ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        loopback = parsed.hostname == "localhost"
    if parsed.scheme != "https" and not loopback and not internal:
        raise ValueError("非本机平台必须使用 HTTPS；Compose 内网由自动配对配置")
    return value


class Client:
    def __init__(self, server, credential="", *, internal=False):
        self.server = server_url(server, internal=internal)
        self.credential = credential

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, body=None, *, binary=False):
        headers = {}
        if self.credential:
            headers["Authorization"] = "Bearer " + self.credential
        if body is not None:
            headers["Content-Type"] = "application/json"
        payload = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        request = urllib.request.Request(self.server + "/api" + path, data=payload, headers=headers)
        try:
            with self.opener.open(request, timeout=100 if path.endswith("/model") else 8) as response:
                maximum = 16 * 1024 * 1024 if binary else 2 * 1024 * 1024
                raw = response.read(maximum + 1)
            if len(raw) > maximum:
                raise RequestFailure(413, "response_too_large")
            return raw if binary else json.loads(raw)
        except urllib.error.HTTPError as exc:
            # Only stable codes are interpreted; never print a response body or credentials.
            raise RequestFailure(exc.code, "platform_http_" + str(exc.code)) from None
        except (OSError, urllib.error.URLError):
            raise RequestFailure() from None
        except (ValueError, TypeError):
            raise RequestFailure(422, "invalid_response") from None

    def upload(self, path, raw):
        if len(raw) > 16777216:
            raise RequestFailure(413, "candidate_too_large")
        request = urllib.request.Request(
            self.server + "/api" + path,
            data=raw,
            headers={"Content-Type": "application/zip", "Authorization": "Bearer " + self.credential},
        )
        try:
            with self.opener.open(request, timeout=20) as response:
                content = response.read(2097153)
            if len(content) > 2097152:
                raise RequestFailure(413, "response_too_large")
            return json.loads(content)
        except urllib.error.HTTPError as exc:
            raise RequestFailure(exc.code, "platform_http_" + str(exc.code)) from None
        except (OSError, urllib.error.URLError):
            raise RequestFailure() from None
        except (ValueError, TypeError):
            raise RequestFailure(422, "invalid_response") from None
