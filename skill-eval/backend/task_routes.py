from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from backend.common import canonical, db_connection, digest, jsonb, new_id, required, setting
from backend.queue import TERMINAL, capable, expire_leases
from backend.security import get_admin
from backend.storage import files_digest, unpack_zip
from backend.validation import validate_suite

router = APIRouter(prefix="/api", tags=["tasks"], dependencies=[Depends(get_admin)])


class TaskInput(BaseModel):
    kind: Literal["evaluate", "generate"]
    skill_version_id: UUID
    set_id: UUID | None = None
    expected_set_version_id: UUID | None = None
    expected_model_id: UUID | None = None
    confirmed: bool = False
    count: int = Field(default=5, ge=1, le=30)
    requirements: str = Field(default="", max_length=8000)


def idempotency(value: str | None) -> str:
    if not value or len(value) > 160 or not value.isascii() or not value.isprintable():
        raise HTTPException(422, "需要有效的 Idempotency-Key")
    return value


@router.post("/tasks")
def create_task(body: TaskInput, request: Request,
                idempotency_key: Annotated[str | None, Header()] = None, connection=Depends(db_connection)):
    key, request_hash = idempotency(idempotency_key), digest(canonical(body.model_dump()))
    existing = connection.execute("SELECT * FROM tasks WHERE idempotency_key=%s", (key,)).fetchone()
    if existing:
        if existing["request_hash"] != request_hash:
            raise HTTPException(409, "同一请求标识不能用于不同任务内容")
        return existing
    source = required(connection.execute("SELECT v.*,s.name,s.default_set_id FROM skill_versions v JOIN skills s ON s.id=v.skill_id WHERE v.id=%s AND NOT s.archived", (body.skill_version_id,)).fetchone())
    model = setting(connection, "model")
    if not model or not model.get("name") or not model.get("connection_fingerprint"):
        raise HTTPException(409, "请先在系统配置中选择 Codex 连接与模型")
    if body.expected_model_id and str(body.expected_model_id) != model.get("id"):
        raise HTTPException(409, "模型配置已改变，请关闭确认窗口后重新选择")
    snapshot = {"skill_version_id": str(source["id"]), "skill_id": str(source["skill_id"]),
                "skill_name": source["name"], "skill_revision": source["revision"], "skill_blob": source["blob"],
                "model": model, "engine": "codex", "skill_up_version": "0.14.0"}
    skill_files = unpack_zip(request.app.state.store.get(source["blob"]))
    snapshot["source_digest"] = files_digest({name: file for name, file in skill_files.items() if not name.startswith("evals/")})
    if body.kind == "evaluate":
        chosen = body.set_id or source["default_set_id"]
        suite = connection.execute(
            """SELECT v.*,e.id AS evaluation_set_id,e.name FROM evaluation_sets e JOIN set_versions v ON v.id=e.active_version_id
               WHERE e.id=%s AND e.skill_id=%s AND NOT e.archived AND NOT v.archived AND v.kind='SAVED'""",
            (chosen, source["skill_id"])).fetchone() if chosen else None
        if suite is None:
            raise HTTPException(409, "请先处理已有草稿，或导入并启用一个非空评测集")
        if body.expected_set_version_id and body.expected_set_version_id != suite["id"]:
            raise HTTPException(409, "启用案例已改变，请关闭确认窗口后重新选择")
        validation = validate_suite(unpack_zip(request.app.state.store.get(suite["blob"])), request.app.state.settings.skill_up)
        if not validation["valid"]:
            raise HTTPException(422, {"message": "启用版本未通过全量校验", "validation": validation})
        snapshot.update(set_id=str(suite["evaluation_set_id"]), set_version_id=str(suite["id"]),
                        set_revision=suite["revision"], set_name=suite["name"], suite_blob=suite["blob"],
                        cases=validation["cases"], source_skill_version_id=str(suite["source_skill_version_id"]))
        snapshot["timeout_seconds"] = 240 + sum(int(case["timeout_seconds"]) + int(case["judge_timeout_seconds"])
                                               for case in validation["cases"])
    else:
        if not body.confirmed:
            raise HTTPException(409, "需要明确确认后才能调用 Codex 生成案例")
        if body.set_id:
            required(connection.execute("SELECT id FROM evaluation_sets WHERE id=%s AND skill_id=%s AND NOT archived", (body.set_id, source["skill_id"])).fetchone())
            snapshot["set_id"] = str(body.set_id)
        else:
            previous = connection.execute("SELECT id FROM evaluation_sets WHERE skill_id=%s AND NOT archived LIMIT 1", (source["skill_id"],)).fetchone()
            if previous:
                raise HTTPException(409, "已有评测集或草稿；请在对应评测集中明确选择重新生成")
        snapshot.update(count=body.count, requirements=body.requirements, timeout_seconds=900)
    row = connection.execute(
        """INSERT INTO tasks(id,kind,skill_id,idempotency_key,request_hash,input,state)
           VALUES(%s,%s,%s,%s,%s,%s,'QUEUED') ON CONFLICT(idempotency_key) DO NOTHING RETURNING *""",
        (new_id(), body.kind, source["skill_id"], key, request_hash, jsonb(snapshot))).fetchone()
    if row is None:
        row = connection.execute("SELECT * FROM tasks WHERE idempotency_key=%s", (key,)).fetchone()
        if row["request_hash"] != request_hash:
            raise HTTPException(409, "同一请求标识不能用于不同任务内容")
    return row


@router.get("/tasks")
def list_tasks(connection=Depends(db_connection), limit: int = 100,
               offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
               kind: Literal["evaluate", "generate"] | None = None,
               query: Annotated[str, Query(max_length=200)] = ""):
    expire_leases(connection)
    rows = connection.execute(
        """SELECT * FROM tasks WHERE (%s::text IS NULL OR kind=%s)
           AND (%s='' OR input->>'skill_name' ILIKE %s OR id::text ILIKE %s)
           ORDER BY created_at DESC,id DESC LIMIT %s OFFSET %s""",
        (kind, kind, query, "%" + query + "%", "%" + query + "%", min(max(limit, 1), 200), offset)).fetchall()
    workers = connection.execute("SELECT capabilities FROM workers WHERE NOT revoked AND last_seen>now()-interval '30 seconds'").fetchall()
    for row in rows:
        if row["state"] == "QUEUED":
            row["waiting_reason"] = "排队中" if any(capable(worker["capabilities"], row["input"]) for worker in workers) else "等待匹配连接与版本的 Worker"
    return rows


@router.get("/tasks/{task_id}")
def task_detail(task_id: UUID, connection=Depends(db_connection)):
    expire_leases(connection)
    task = required(connection.execute("SELECT * FROM tasks WHERE id=%s", (task_id,)).fetchone())
    attempts = connection.execute("SELECT a.id,a.number,a.worker_id,w.name AS worker_name,a.state,a.created_at,a.finished_at,a.summary FROM attempts a JOIN workers w ON w.id=a.worker_id WHERE task_id=%s ORDER BY number", (task_id,)).fetchall()
    artifacts = connection.execute("SELECT ar.id,ar.attempt_id,ar.kind,ar.blob,ar.created_at,(a.summary->>'html_available')::boolean AS html_available FROM artifacts ar JOIN attempts a ON a.id=ar.attempt_id WHERE ar.task_id=%s ORDER BY ar.created_at", (task_id,)).fetchall()
    return {**task, "attempts": attempts, "artifacts": artifacts}


@router.get("/tasks/{task_id}/events")
def task_events(task_id: UUID, after: int = 0, connection=Depends(db_connection)):
    required(connection.execute("SELECT id FROM tasks WHERE id=%s", (task_id,)).fetchone())
    return connection.execute("SELECT e.attempt_id,e.sequence,e.payload,e.created_at FROM events e JOIN attempts a ON a.id=e.attempt_id WHERE a.task_id=%s AND e.sequence>%s ORDER BY e.created_at,e.sequence LIMIT 500", (task_id, after)).fetchall()


@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: UUID, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM tasks WHERE id=%s FOR UPDATE", (task_id,)).fetchone())
    if row["state"] in TERMINAL:
        return row
    if row["state"] == "QUEUED":
        return connection.execute("UPDATE tasks SET state='CANCELLED',verdict=%s,finished_at=now(),state_version=state_version+1 WHERE id=%s RETURNING *", ("INCOMPLETE" if row["kind"] == "evaluate" else None, task_id)).fetchone()
    return connection.execute("UPDATE tasks SET state='CANCEL_REQUESTED',state_version=state_version+1 WHERE id=%s RETURNING *", (task_id,)).fetchone()


@router.post("/tasks/{task_id}/retry")
def retry_task(task_id: UUID, idempotency_key: Annotated[str | None, Header()] = None, connection=Depends(db_connection)):
    key = idempotency(idempotency_key)
    row = required(connection.execute("SELECT * FROM tasks WHERE id=%s FOR UPDATE", (task_id,)).fetchone())
    prior = connection.execute("SELECT task_id FROM task_retries WHERE idempotency_key=%s", (key,)).fetchone()
    if prior:
        if prior["task_id"] != task_id:
            raise HTTPException(409, "重试请求标识已用于其他任务")
        return row
    if row["state"] not in {"FAILED", "CANCELLED", "INTERRUPTED"} and not (row["state"] == "SUCCEEDED" and row["verdict"] == "FAILED"):
        raise HTTPException(409, "当前状态不能重试；已完成的评测可从 Skills 再次发起")
    inserted = connection.execute("INSERT INTO task_retries(idempotency_key,task_id) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING task_id", (key, task_id)).fetchone()
    if not inserted:
        prior = connection.execute("SELECT task_id FROM task_retries WHERE idempotency_key=%s", (key,)).fetchone()
        if prior["task_id"] != task_id:
            raise HTTPException(409, "重试请求标识已用于其他任务")
        return row
    return connection.execute("UPDATE tasks SET state='QUEUED',verdict=NULL,summary=NULL,current_attempt_id=NULL,finished_at=NULL,queued_at=now(),state_version=state_version+1 WHERE id=%s RETURNING *", (task_id,)).fetchone()


@router.get("/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: UUID, request: Request, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM artifacts WHERE id=%s", (artifact_id,)).fetchone())
    return Response(request.app.state.store.get(row["blob"]), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="task-artifacts.zip"'})


@router.get("/artifacts/{artifact_id}/report")
def preview_report(artifact_id: UUID, request: Request, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM artifacts WHERE id=%s", (artifact_id,)).fetchone())
    files = unpack_zip(request.app.state.store.get(row["blob"]))
    reports = [file.data for name, file in files.items() if name.endswith("/report.html") or name == "report.html"]
    if len(reports) != 1:
        raise HTTPException(404, "该次执行没有唯一的 HTML 报告")
    return Response(reports[0], media_type="text/html", headers={
        "Content-Security-Policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
        "Cache-Control": "no-store"})
