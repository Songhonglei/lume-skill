import base64
import hashlib
import hmac
import secrets
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, Response

from backend.common import db_connection, digest


def hash_password(password: str) -> str:
    if len(password) < 10 or len(password) > 1024:
        raise HTTPException(422, "密码长度需要 10–1024 个字符")
    salt = secrets.token_bytes(16)
    value = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1,
                           maxmem=64 * 1024 * 1024, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(value).decode()


def verify_password(password: str, stored: str) -> bool:
    if len(password) > 1024:
        return False
    try:
        _, salt, expected = stored.split("$")
        value = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=32768, r=8, p=1,
                               maxmem=64 * 1024 * 1024, dklen=32)
        return hmac.compare_digest(value, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def require_origin(request: Request):
    allowed = {request.app.state.settings.public_url.rstrip("/")}
    if request.app.state.settings.dev_origin:
        allowed.add(request.app.state.settings.dev_origin.rstrip("/"))
    if request.headers.get("origin") not in allowed:
        raise HTTPException(403, "请求来源不受信任，请从配置的工作台地址操作")


def session_digest(request: Request, token: str) -> str:
    return hmac.new(request.app.state.instance_key.encode(), token.encode(), "sha256").hexdigest()


def get_admin(request: Request, connection=Depends(db_connection)):
    token = request.cookies.get("ose_session", "")
    row = connection.execute("SELECT * FROM sessions WHERE token_hash=%s AND expires_at>now()",
                             (session_digest(request, token),)).fetchone() if token else None
    if row is None:
        raise HTTPException(401, "请先登录")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        require_origin(request)
        csrf = request.headers.get("x-csrf-token", "")
        if not csrf or not hmac.compare_digest(digest(csrf), row["csrf_hash"]):
            raise HTTPException(403, "页面验证已失效，请刷新后重试")
    return row


def create_session(request: Request, response: Response, connection) -> dict:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    duration = request.app.state.settings.session_hours * 3600
    connection.execute("INSERT INTO sessions(token_hash,csrf_hash,expires_at) VALUES(%s,%s,now()+%s*interval '1 second')",
                       (session_digest(request, token), digest(csrf), duration))
    secure = urlsplit(request.app.state.settings.public_url).scheme == "https"
    response.set_cookie("ose_session", token, max_age=duration, httponly=True, secure=secure,
                        samesite="strict", path="/")
    response.set_cookie("ose_csrf", csrf, max_age=duration, httponly=False, secure=secure,
                        samesite="strict", path="/")
    return {"authenticated": True, "csrf_token": csrf}
