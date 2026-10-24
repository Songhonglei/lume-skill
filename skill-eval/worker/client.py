"""Center API client. The durable Worker credential never enters model environments."""
import base64
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import httpx


class ProtocolError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def save_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".state-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        Path(temporary).unlink(missing_ok=True)


def parse_enrollment(code: str) -> dict:
    try:
        prefix, encoded = code.strip().split(".", 1)
        if prefix != "ose1" or len(code) > 3000:
            raise ValueError
        value = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        url = urlsplit(value["url"])
        if url.scheme not in {"http", "https"} or not url.netloc or url.username or url.password or url.query or url.fragment or url.path not in {"", "/"}:
            raise ValueError
        if url.scheme == "http" and url.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ProtocolError(400, "非本机接入需要 HTTPS 工作台地址")
        if not isinstance(value["code"], str) or not value["code"]:
            raise ValueError
        return value
    except (ValueError, KeyError, TypeError) as error:
        raise ProtocolError(400, "接入码格式不正确，请完整复制工作台生成的接入码") from error


class Center:
    def __init__(self, url: str, token: str = ""):
        self.url, self.token = url.rstrip("/"), token
        self.http = httpx.Client(base_url=self.url, timeout=httpx.Timeout(15, connect=5), follow_redirects=False)

    def close(self):
        self.http.close()

    def request(self, method, path, **kwargs):
        headers = {**({"Authorization": "Bearer " + self.token} if self.token else {}), **kwargs.pop("headers", {})}
        response = self.http.request(method, path, headers=headers, **kwargs)
        if response.status_code >= 400 or response.is_redirect:
            try:
                detail = response.json().get("detail", "中心拒绝了当前请求")
            except ValueError:
                detail = "中心暂时不可用" if response.status_code >= 500 else "中心响应格式异常"
            raise ProtocolError(response.status_code, detail if isinstance(detail, str) else "请求未通过中心校验")
        return response

    def heartbeat(self, capabilities, job=None, probe_result=None):
        payload = {"capabilities": capabilities}
        if job:
            payload.update(attempt_id=job["attempt_id"], lease_token=job["lease_token"])
        if probe_result:
            payload["probe_result"] = probe_result
        return self.request("POST", "/api/worker/heartbeat", json=payload).json()

    def complete(self, job, bundle: Path, metadata):
        with bundle.open("rb") as stream:
            return self.request("POST", f"/api/worker/attempts/{job['attempt_id']}/complete",
                                headers={"X-Lease-Token": job["lease_token"]},
                                files={"file": ("artifacts.zip", stream, "application/zip")},
                                data={"metadata": json.dumps(metadata)}).json()
