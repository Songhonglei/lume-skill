from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from backend.common import db_connection, jsonb, new_id, required, set_setting, setting
from backend.security import get_admin
from worker.engine import CODEX_VERSION, SKILL_UP_VERSION

router = APIRouter(prefix="/api", tags=["settings"], dependencies=[Depends(get_admin)])


@router.get("/settings")
def read_settings(request: Request, connection=Depends(db_connection)):
    return {"model": setting(connection, "model"), "public_url": request.app.state.settings.public_url,
            "required_versions": {"skill_up": SKILL_UP_VERSION, "codex": CODEX_VERSION},
            "storage": {"database": "PostgreSQL", "files": "本机持久化文件库"},
            "limits": {"archive_mib": 100, "expanded_mib": 500, "files": 10000}}


class ModelInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    worker_id: UUID

    @field_validator("name")
    @classmethod
    def printable(cls, value):
        if any(ord(char) < 32 for char in value) or not value.strip():
            raise ValueError("模型名称不能包含控制字符或为空")
        return value.strip()


@router.put("/settings/model")
def save_model(body: ModelInput, connection=Depends(db_connection)):
    worker = required(connection.execute("SELECT * FROM workers WHERE id=%s AND NOT revoked", (body.worker_id,)).fetchone())
    capabilities = worker["capabilities"]
    if not capabilities.get("connection_fingerprint"):
        raise HTTPException(409, "该 Worker 尚未检测到可选的 Codex 连接")
    previous = setting(connection, "model")
    if previous and previous["name"] == body.name and previous["connection_fingerprint"] == capabilities["connection_fingerprint"]:
        return previous
    model = {"id": new_id(), "name": body.name, "connection_fingerprint": capabilities["connection_fingerprint"],
             "connection_label": capabilities.get("connection_label", "Codex 登录")}
    set_setting(connection, "model", model)
    return model


@router.get("/workers")
def list_workers(connection=Depends(db_connection)):
    return connection.execute("SELECT id,name,capabilities,revoked,builtin,last_seen,created_at,probe_request,probe_result,last_seen>now()-interval '30 seconds' AS online FROM workers ORDER BY created_at").fetchall()


@router.post("/workers/{worker_id}/probe")
def probe(worker_id: UUID, idempotency_key: str = Header(), connection=Depends(db_connection)):
    if not idempotency_key or len(idempotency_key) > 160:
        raise HTTPException(422, "需要有效的请求标识")
    row = required(connection.execute("SELECT * FROM workers WHERE id=%s AND NOT revoked FOR UPDATE", (worker_id,)).fetchone())
    if row["probe_request"]:
        if row["probe_request"]["id"] == idempotency_key:
            return row["probe_request"]
        raise HTTPException(409, "连接检查已在等待或执行中")
    if row["probe_result"] and row["probe_result"].get("id") == idempotency_key:
        return row["probe_result"]
    model = setting(connection, "model")
    if not model:
        raise HTTPException(409, "请先保存模型设置")
    job = {"id": idempotency_key, "model": model["name"]}
    connection.execute("UPDATE workers SET probe_request=%s WHERE id=%s", (jsonb(job), worker_id))
    return job


@router.post("/workers/{worker_id}/revoke")
def revoke_worker(worker_id: UUID, connection=Depends(db_connection)):
    required(connection.execute("SELECT id FROM workers WHERE id=%s FOR UPDATE", (worker_id,)).fetchone())
    connection.execute("UPDATE workers SET revoked=true WHERE id=%s", (worker_id,))
    rows = connection.execute("SELECT t.* FROM tasks t JOIN attempts a ON a.id=t.current_attempt_id WHERE a.worker_id=%s AND a.state='ACTIVE' FOR UPDATE OF t", (worker_id,)).fetchall()
    for row in rows:
        summary = {"reason": "Worker 已被撤销；原执行中断，不自动重跑"}
        connection.execute("UPDATE attempts SET state='EXPIRED',summary=%s,finished_at=now() WHERE id=%s", (jsonb(summary), row["current_attempt_id"]))
        connection.execute("UPDATE tasks SET state='INTERRUPTED',verdict=%s,summary=%s,finished_at=now(),state_version=state_version+1 WHERE id=%s",
                           ("INCOMPLETE" if row["kind"] == "evaluate" else None, jsonb(summary), row["id"]))
    return {"revoked": True}
