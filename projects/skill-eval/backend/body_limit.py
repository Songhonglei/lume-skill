from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    """Count streamed bodies too; Content-Length alone cannot bound chunked uploads."""
    def __init__(self, app, limit=104 * 1024 * 1024):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        length = dict(scope.get("headers", [])).get(b"content-length")
        if length and (not length.isdigit() or int(length) > self.limit):
            return await JSONResponse({"detail": "请求内容超过上传限额"}, status_code=413)(scope, receive, send)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    raise HTTPException(413, "请求内容超过上传限额")
            return message

        await self.app(scope, bounded_receive, send)
