import asyncio
import logging
import os
import secrets
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import auth_routes, resource_routes, settings_routes, task_routes, worker_routes
from backend.body_limit import BodyLimitMiddleware
from backend.config import Settings
from backend.db import Database
from backend.queue import expire_leases
from backend.storage import BlobStore, PackageError


def ensure_secret(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.exists():
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".secret-")
        try:
            with os.fdopen(fd, "w") as stream:
                stream.write(secrets.token_urlsafe(48))
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)
            except FileExistsError:
                pass
        finally:
            Path(temporary).unlink(missing_ok=True)
    if path.stat().st_mode & 0o777 != 0o600:
        path.chmod(0o600)
    if len(path.read_text().strip()) < 32:
        raise RuntimeError("实例密钥文件不完整，请从备份恢复，未覆盖已有文件")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    database = Database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        settings.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        key = settings.data_dir / "instance-key"
        ensure_secret(key)
        app.state.instance_key = key.read_text().strip()
        if settings.builtin_secret_file:
            ensure_secret(settings.builtin_secret_file)
        database.open()
        stop = asyncio.Event()

        def sweep():
            with database.connection() as connection:
                expire_leases(connection)

        async def maintain_leases():
            while not stop.is_set():
                try:
                    await asyncio.to_thread(sweep)
                except Exception:
                    logging.getLogger(__name__).error("租约维护暂时失败，等待数据库恢复")
                try:
                    await asyncio.wait_for(stop.wait(), timeout=2)
                except TimeoutError:
                    pass

        maintenance = asyncio.create_task(maintain_leases())
        try:
            yield
        finally:
            stop.set()
            await maintenance
            database.close()

    app = FastAPI(title="Open Skill Eval", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = database
    app.state.store = BlobStore(settings.data_dir / "blobs")

    @app.middleware("http")
    async def response_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'")
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(PackageError)
    async def package_error(request, error):
        return JSONResponse({"detail": str(error)}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, error):
        return JSONResponse({"detail": jsonable_encoder(error.detail)}, status_code=error.status_code,
                            headers=error.headers)

    @app.get("/api/health")
    def health():
        with database.connection() as connection:
            connection.execute("SELECT 1")
        return {"status": "ok", "version": "0.1.0"}

    app.include_router(auth_routes.router)
    app.include_router(resource_routes.router)
    app.include_router(settings_routes.router)
    app.include_router(task_routes.router)
    app.include_router(worker_routes.router)
    app.add_middleware(BodyLimitMiddleware)
    distribution = Path(__file__).resolve().parent.parent / "frontend/dist"
    if distribution.is_dir():
        app.mount("/", StaticFiles(directory=distribution, html=True), name="frontend")
    return app


app = create_app()
