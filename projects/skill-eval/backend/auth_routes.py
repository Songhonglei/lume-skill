import hmac
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.common import db_connection
from backend.security import create_session, get_admin, hash_password, require_origin, verify_password

router = APIRouter(prefix="/api", tags=["session"])


class PasswordInput(BaseModel):
    password: str = Field(max_length=1024)
    setup_token: str = Field(default="", max_length=1024)


@router.get("/setup")
def setup_status(request: Request, connection=Depends(db_connection)):
    initialized = connection.execute("SELECT 1 FROM administrator").fetchone() is not None
    remote = urlsplit(request.app.state.settings.public_url).hostname not in {"localhost", "127.0.0.1", "::1"}
    return {"initialized": initialized, "requires_setup_token": remote}


@router.post("/setup", dependencies=[Depends(require_origin)])
def setup(body: PasswordInput, request: Request, response: Response, connection=Depends(db_connection)):
    # Serialize the first administrator even when two first-use requests race.
    connection.execute("SELECT pg_advisory_xact_lock(684913291)")
    if connection.execute("SELECT 1 FROM administrator").fetchone():
        raise HTTPException(409, "已经初始化，请登录")
    settings = request.app.state.settings
    remote = urlsplit(settings.public_url).hostname not in {"localhost", "127.0.0.1", "::1"}
    if remote and (not settings.setup_token or not hmac.compare_digest(body.setup_token, settings.setup_token)):
        raise HTTPException(403, "远程首次初始化需要部署时设置的一次性初始化口令")
    if remote and not settings.public_url.startswith("https://"):
        raise HTTPException(400, "远程访问请先配置 HTTPS")
    connection.execute("INSERT INTO administrator(password_hash) VALUES(%s)", (hash_password(body.password),))
    return create_session(request, response, connection)


@router.post("/session", dependencies=[Depends(require_origin)])
def login(body: PasswordInput, request: Request, response: Response, connection=Depends(db_connection)):
    identity = request.client.host if request.client else "local"
    connection.execute("INSERT INTO login_limits(identity,failures,window_start) VALUES(%s,0,now()) ON CONFLICT DO NOTHING",
                       (identity,))
    row = connection.execute("SELECT *,window_start<now()-interval '5 minutes' AS reset FROM login_limits WHERE identity=%s FOR UPDATE",
                             (identity,)).fetchone()
    if row["reset"]:
        connection.execute("UPDATE login_limits SET failures=0,window_start=now() WHERE identity=%s", (identity,))
    elif row["failures"] >= 10:
        # Return a response, so the transaction retains the rate-limit record.
        response.status_code = 429
        response.headers["Retry-After"] = "300"
        return {"detail": "尝试次数较多，请 5 分钟后再试"}
    admin = connection.execute("SELECT password_hash FROM administrator").fetchone()
    if admin is None or not verify_password(body.password, admin["password_hash"]):
        connection.execute("UPDATE login_limits SET failures=failures+1 WHERE identity=%s", (identity,))
        response.status_code = 401
        return {"detail": "密码不正确"}
    connection.execute("DELETE FROM login_limits WHERE identity=%s", (identity,))
    return create_session(request, response, connection)


@router.get("/session")
def session(request: Request, admin=Depends(get_admin)):
    return {"authenticated": True, "csrf_token": request.cookies.get("ose_csrf", "")}


@router.delete("/session")
def logout(response: Response, admin=Depends(get_admin), connection=Depends(db_connection)):
    connection.execute("DELETE FROM sessions WHERE token_hash=%s", (admin["token_hash"],))
    response.delete_cookie("ose_session")
    response.delete_cookie("ose_csrf")
    return {"authenticated": False}


@router.post("/settings/password")
def change_password(body: PasswordInput, request: Request, response: Response,
                    admin=Depends(get_admin), connection=Depends(db_connection)):
    connection.execute("UPDATE administrator SET password_hash=%s", (hash_password(body.password),))
    connection.execute("DELETE FROM sessions")
    return create_session(request, response, connection)
