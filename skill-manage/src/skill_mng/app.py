import json
import secrets
import sqlite3
import time
import zipfile
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .auth import bootstrap_token, create_user, digest, initialize, make_session, verify_password
from .config import data_path, read_config
from .db import migrate, transaction
from .fetch import fetch_package
from .imports import begin_import, complete_import
from .packages import MAX_FILE, MAX_PACKAGE, directory_zip
from .registry import may_write, record_event
from .tasks import Conflict

STATIC = Path(__file__).parent / "static"
MAX_REQUEST = 36 * 1024 * 1024


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        length = headers.get(b"content-length", b"0")
        if not length.isdigit() or int(length) > MAX_REQUEST:
            return await JSONResponse({"detail": "请求内容过大"}, 413)(scope, receive, send)
        consumed = 0

        async def bounded_receive():
            nonlocal consumed
            message = await receive()
            consumed += len(message.get("body", b""))
            if consumed > MAX_REQUEST:
                raise HTTPException(413, "请求内容过大")
            return message

        await self.app(scope, bounded_receive, send)


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class Onboard(Login):
    token: str = Field(min_length=1, max_length=128)


class UserCreate(Login):
    role: str = "maintainer"


class UserUpdate(BaseModel):
    active: bool


class URLImport(BaseModel):
    url: str = Field(max_length=2048)
    name: str = Field(default="", max_length=80)
    version: str = Field(default="", max_length=80)


class ImportComplete(BaseModel):
    import_token: str = Field(min_length=1, max_length=128)
    name: str = Field(default="", max_length=80)
    version: str = Field(default="", max_length=80)


class Pointer(BaseModel):
    version_id: str


class Owner(BaseModel):
    owner_id: str


def create_app(root: Path | str | None = None) -> FastAPI:
    root = data_path(root)

    @asynccontextmanager
    async def lifespan(_):
        migrate(root)
        bootstrap_token(root)
        yield

    app = FastAPI(
        title="Open Skill Manager", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None
    )
    app.state.root = root
    attempts: dict[str, deque] = defaultdict(deque)
    app.add_middleware(BodyLimit)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.update(
            {
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Referrer-Policy": "no-referrer",
                "Cache-Control": "no-store",
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            }
        )
        return response

    for error, status in ((ValueError, 400), (PermissionError, 403), (FileExistsError, 409), (Conflict, 409)):

        def handler(request, exc, status=status):
            return JSONResponse({"detail": str(exc)}, status)

        app.add_exception_handler(error, handler)

    @app.exception_handler(sqlite3.IntegrityError)
    def integrity_error(request, exc):
        return JSONResponse({"detail": "账号或记录已存在，或关联记录无效"}, 409)

    def rate_limit(request: Request):
        # Single server process by design. Bounded memory; both login and onboard share this guard.
        key = request.client.host if request.client else "unknown"
        current = time.monotonic()
        if len(attempts) > 4096:
            for old_key in list(attempts):
                if not attempts[old_key] or attempts[old_key][-1] < current - 60:
                    del attempts[old_key]
            if len(attempts) > 4096 and key not in attempts:
                raise HTTPException(429, "请求较多，请稍后再试")
        window = attempts[key]
        while window and window[0] < current - 60:
            window.popleft()
        if len(window) >= 10:
            raise HTTPException(429, "尝试较多，请一分钟后再试")
        window.append(current)

    def same_origin(request: Request):
        origin = request.headers.get("origin")
        expected = read_config(root).get("public_url") or str(request.base_url).rstrip("/")
        if origin and origin != expected:
            raise HTTPException(403, "请求来源不匹配")

    def authenticated(request: Request) -> dict:
        token = request.cookies.get("skill_session", "")
        with transaction(root) as db:
            row = db.execute(
                "SELECT u.id,u.username,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id "
                "WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
                (digest(token), int(time.time())),
            ).fetchone()
        if not row:
            raise HTTPException(401, "请先登录")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            same_origin(request)
            if not secrets.compare_digest(row["csrf"], request.headers.get("x-csrf-token", "")):
                raise HTTPException(403, "会话验证失败，请刷新后重试")
        return dict(row)

    def admin(user=Depends(authenticated)):
        if user["role"] != "admin":
            raise HTTPException(403, "此操作需要管理员权限")
        return user

    @app.get("/api/health")
    def health():
        with transaction(root) as db:
            schema = db.execute("PRAGMA user_version").fetchone()[0]
        return {
            "status": "ok",
            "version": __version__,
            "schema_version": schema,
            "capabilities": ["registry", "users", "immutable_versions", "workers", "audit"],
            "worker": "implemented",
        }

    @app.get("/api/onboard")
    def onboard_status():
        with transaction(root) as db:
            initialized = bool(db.execute("SELECT 1 FROM users LIMIT 1").fetchone())
        return {"initialized": initialized}

    @app.post("/api/onboard")
    def onboard(body: Onboard, request: Request):
        same_origin(request)
        rate_limit(request)
        if not initialize(root, body.token, body.username, body.password):
            raise HTTPException(409, "已完成初始化，请直接登录")
        return {"initialized": True}

    @app.post("/api/login")
    def login(body: Login, request: Request, response: Response):
        same_origin(request)
        rate_limit(request)
        with transaction(root, write=True) as db:
            user = db.execute(
                "SELECT * FROM users WHERE username=? AND active=1", (body.username,)
            ).fetchone()
            # The dummy hash keeps missing accounts on the same expensive password path.
            encoded = user["password_hash"] if user else "scrypt$" + "00" * 16 + "$" + "00" * 64
            if not verify_password(body.password, encoded) or not user:
                raise HTTPException(401, "账号或密码不正确")
            token, csrf = make_session(db, user["id"])
        response.set_cookie(
            "skill_session",
            token,
            httponly=True,
            samesite="strict",
            max_age=86400,
            secure=(
                read_config(root).get("public_url", "").startswith("https://")
                or request.url.scheme == "https"
            ),
            path="/",
        )
        return {"id": user["id"], "username": user["username"], "role": user["role"], "csrf": csrf}

    @app.get("/api/me")
    def me(user=Depends(authenticated)):
        return user

    @app.post("/api/logout")
    def logout(request: Request, response: Response, user=Depends(authenticated)):
        with transaction(root, write=True) as db:
            db.execute(
                "DELETE FROM sessions WHERE token_hash=?", (digest(request.cookies.get("skill_session", "")),)
            )
        response.delete_cookie("skill_session", path="/")
        return {"ok": True}

    @app.get("/api/users")
    def users(user=Depends(admin)):
        with transaction(root) as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT id,username,role,active,created_at FROM users ORDER BY created_at"
                )
            ]

    @app.post("/api/users", status_code=201)
    def add_user(body: UserCreate, user=Depends(admin)):
        if body.role not in ("admin", "maintainer"):
            raise ValueError("角色只能是 admin 或 maintainer")
        with transaction(root, write=True) as db:
            result = create_user(db, body.username, body.password, body.role)
            record_event(db, user["id"], "user.created", result["id"])
            return result

    @app.patch("/api/users/{user_id}")
    def update_user(user_id: str, body: UserUpdate, user=Depends(admin)):
        if user_id == user["id"] and not body.active:
            raise ValueError("不能停用当前登录的管理员")
        with transaction(root, write=True) as db:
            target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not target:
                raise HTTPException(404, "账号不存在")
            if target["role"] == "admin" and not body.active:
                count = db.execute(
                    "SELECT count(*) FROM users WHERE role='admin' AND active=1 AND id<>?", (user_id,)
                ).fetchone()[0]
                if not count:
                    raise ValueError("需保留至少一个可用管理员")
            db.execute("UPDATE users SET active=? WHERE id=?", (int(body.active), user_id))
            if not body.active:
                db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            record_event(db, user["id"], "user.updated", user_id, {"active": body.active})
        return {"ok": True}

    @app.get("/api/skills")
    def skills(user=Depends(authenticated)):
        with transaction(root) as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT s.*,u.username AS owner,v.version AS current_version,"
                    "(SELECT count(*) FROM versions x WHERE x.skill_id=s.id) AS version_count "
                    "FROM skills s JOIN users u ON u.id=s.owner_id LEFT JOIN versions v ON v.id=s.current_version_id ORDER BY s.created_at DESC"
                )
            ]

    @app.get("/api/skills/{skill_id}")
    def skill_detail(skill_id: str, user=Depends(authenticated)):
        with transaction(root) as db:
            row = db.execute(
                "SELECT s.*,u.username AS owner FROM skills s JOIN users u ON u.id=s.owner_id WHERE s.id=?",
                (skill_id,),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Skill 不存在")
            result = dict(row)
            result["can_write"] = may_write(user, row)
            result["versions"] = [
                dict(v)
                for v in db.execute(
                    "SELECT v.id,v.version,v.content_digest,v.created_at,a.digest AS artifact_digest,a.byte_size "
                    "FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.skill_id=? ORDER BY v.created_at DESC",
                    (skill_id,),
                )
            ]
            return result

    @app.post("/api/import/upload")
    def import_upload(
        file: UploadFile = File(...),
        name: str = Form(""),
        version: str = Form(""),
        user=Depends(authenticated),
    ):
        raw = file.file.read(MAX_PACKAGE + 1)
        return begin_import(root, user, raw, name, version)

    @app.post("/api/import/directory")
    def import_directory(
        files: list[UploadFile] = File(...),
        name: str = Form(""),
        version: str = Form(""),
        user=Depends(authenticated),
    ):
        if len(files) > 500:
            raise ValueError("目录文件数不能超过 500")
        raw = directory_zip([(file.filename or "", file.file.read(MAX_FILE + 1)) for file in files])
        return begin_import(root, user, raw, name, version)

    @app.post("/api/import/url")
    def import_url(body: URLImport, user=Depends(authenticated)):
        return begin_import(root, user, fetch_package(body.url), body.name, body.version)

    @app.post("/api/import/complete")
    def import_complete(body: ImportComplete, user=Depends(authenticated)):
        return complete_import(root, user, body.import_token, body.name, body.version)

    def get_version(version_id: str):
        with transaction(root) as db:
            row = db.execute(
                "SELECT v.*,a.digest AS artifact_digest,a.byte_size,s.slug FROM versions v JOIN artifacts a ON a.id=v.artifact_id "
                "JOIN skills s ON s.id=v.skill_id WHERE v.id=?",
                (version_id,),
            ).fetchone()
        if not row:
            raise HTTPException(404, "版本不存在")
        return row

    @app.get("/api/versions/{version_id}/files")
    def file_list(version_id: str, user=Depends(authenticated)):
        row = get_version(version_id)
        return json.loads(row["manifest_json"])["files"]

    @app.get("/api/versions/{version_id}/file")
    def file_content(version_id: str, path: str, user=Depends(authenticated)):
        row = get_version(version_id)
        info = next((f for f in json.loads(row["manifest_json"])["files"] if f["path"] == path), None)
        if not info:
            raise HTTPException(404, "文件不存在")
        if info["size"] > 256 * 1024:
            raise ValueError("文件较大，请下载完整包查看")
        with zipfile.ZipFile(root / "objects" / (row["artifact_digest"] + ".zip")) as archive:
            content = archive.read(info["archive_name"])
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("此文件不是 UTF-8 文本，请下载查看") from None
        return {"path": path, "content": text, "digest": info["digest"]}

    @app.get("/api/versions/{version_id}/download")
    def download(version_id: str, user=Depends(authenticated)):
        row = get_version(version_id)
        return FileResponse(
            root / "objects" / (row["artifact_digest"] + ".zip"),
            media_type="application/zip",
            filename=f"{row['slug']}-{row['version']}.zip",
            headers={"X-Artifact-SHA256": row["artifact_digest"]},
        )

    @app.put("/api/skills/{skill_id}/current")
    def set_current(skill_id: str, body: Pointer, user=Depends(authenticated)):
        with transaction(root, write=True) as db:
            row = db.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Skill 不存在")
            if not may_write(user, row):
                raise PermissionError("仅维护者或管理员可切换版本")
            if not db.execute(
                "SELECT 1 FROM versions WHERE id=? AND skill_id=?", (body.version_id, skill_id)
            ).fetchone():
                raise ValueError("所选版本不属于此 Skill")
            db.execute("UPDATE skills SET current_version_id=? WHERE id=?", (body.version_id, skill_id))
            record_event(db, user["id"], "skill.current_changed", skill_id, body.model_dump())
        return {"ok": True}

    @app.put("/api/skills/{skill_id}/owner")
    def set_owner(skill_id: str, body: Owner, user=Depends(admin)):
        with transaction(root, write=True) as db:
            if not db.execute("SELECT 1 FROM users WHERE id=? AND active=1", (body.owner_id,)).fetchone():
                raise ValueError("请选择可用账号")
            cursor = db.execute("UPDATE skills SET owner_id=? WHERE id=?", (body.owner_id, skill_id))
            if not cursor.rowcount:
                raise HTTPException(404, "Skill 不存在")
            record_event(db, user["id"], "skill.owner_changed", skill_id, body.model_dump())
        return {"ok": True}

    @app.get("/api/system")
    def system(user=Depends(authenticated)):
        return {
            "version": __version__,
            "stage": "P1–P5",
            "storage": "SQLite + 本地文件",
            "worker": "已启用",
            "audit": "静态预检 + 模型语义审计",
            "repair": "授权修复 + 独立复审 + 新版本",
            "model": "由管理员配置兼容模型服务，并完成工具与结构化输出检测",
        }

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    from .execution_api import install_execution_api

    install_execution_api(app, root, authenticated, admin, rate_limit)
    return app


def factory():
    return create_app()
