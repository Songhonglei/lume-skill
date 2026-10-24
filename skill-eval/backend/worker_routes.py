from __future__ import annotations

import base64
import hmac
import json
import re
import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from backend.common import canonical, db_connection, digest, jsonb, new_id
from backend.queue import authenticate_worker, claim, locked_attempt, require_lease
from backend.resource_routes import create_draft, read_upload
from backend.security import get_admin
from backend.storage import unpack_zip
from backend.validation import validate_suite
from worker.engine import CODEX_VERSION
from worker.results import summarize

router = APIRouter(prefix="/api", tags=["workers"])


class Capabilities(BaseModel):
    skill_up_version: str = Field(default="", max_length=100)
    codex_version: str = Field(default="", max_length=100)
    login_configured: bool = False
    connection_fingerprint: str = Field(default="", max_length=64, pattern=r"^(?:[a-f0-9]{64})?$")
    connection_label: str = Field(default="Codex", max_length=100)
    platform: str = Field(default="", max_length=100)
    diagnostic: str = Field(default="", max_length=1000)


class Enrollment(BaseModel):
    code: str = Field(max_length=1000)
    name: str = Field(min_length=1, max_length=120)
    capabilities: Capabilities


def register(connection, body, builtin=False):
    token, worker_id = secrets.token_urlsafe(32), new_id()
    connection.execute("INSERT INTO workers(id,name,token_hash,capabilities,builtin) VALUES(%s,%s,%s,%s,%s)",
                       (worker_id, body.name, digest(token), jsonb(body.capabilities.model_dump()), builtin))
    return {"worker_id": worker_id, "token": token}


@router.post("/worker-enrollment-codes", dependencies=[Depends(get_admin)])
def enrollment_code(request: Request, connection=Depends(db_connection)):
    secret = secrets.token_urlsafe(32)
    connection.execute("INSERT INTO enrollment_codes(token_hash,expires_at) VALUES(%s,now()+interval '10 minutes')", (digest(secret),))
    payload = canonical({"url": request.app.state.settings.public_url, "code": secret}).encode()
    return {"code": "ose1." + base64.urlsafe_b64encode(payload).decode().rstrip("="), "expires_in_seconds": 600}


@router.post("/worker/enroll")
def enroll(body: Enrollment, connection=Depends(db_connection)):
    row = connection.execute("SELECT *,expires_at>now() AS valid FROM enrollment_codes WHERE token_hash=%s FOR UPDATE", (digest(body.code),)).fetchone()
    if row is None or row["used_at"] is not None or not row["valid"]:
        raise HTTPException(401, "接入码已使用、过期或无效，请在工作台重新生成")
    registered = register(connection, body)
    connection.execute("UPDATE enrollment_codes SET used_at=now() WHERE token_hash=%s", (digest(body.code),))
    return registered


@router.post("/worker/builtin-enroll")
def builtin_enroll(body: Enrollment, request: Request, connection=Depends(db_connection)):
    file = request.app.state.settings.builtin_secret_file
    if not file or not hmac.compare_digest(body.code, file.read_text().strip()):
        raise HTTPException(401, "内置 Worker 接入凭据无效")
    connection.execute("SELECT pg_advisory_xact_lock(684913293)")
    existing = connection.execute("SELECT * FROM workers WHERE builtin ORDER BY created_at LIMIT 1").fetchone()
    if existing and existing["revoked"]:
        raise HTTPException(401, "内置 Worker 已撤销，请在工作台生成新的单次接入码")
    worker_id = str(existing["id"]) if existing else new_id()
    token = hmac.new(body.code.encode(), worker_id.encode(), "sha256").hexdigest()
    if not existing:
        connection.execute("INSERT INTO workers(id,name,token_hash,capabilities,builtin) VALUES(%s,%s,%s,%s,true)",
                           (worker_id, body.name, digest(token), jsonb(body.capabilities.model_dump())))
    elif not hmac.compare_digest(existing["token_hash"], digest(token)):
        raise HTTPException(409, "内置 Worker 凭据与当前实例不一致，请使用单次接入码")
    return {"worker_id": worker_id, "token": token}


class WorkerHello(BaseModel):
    capabilities: Capabilities


@router.post("/worker/claim")
def claim_task(body: WorkerHello, request: Request, authorization: str | None = Header(default=None), connection=Depends(db_connection)):
    worker = authenticate_worker(connection, authorization, lock=True)
    capabilities = body.capabilities.model_dump()
    connection.execute("UPDATE workers SET capabilities=%s,last_seen=now() WHERE id=%s", (jsonb(capabilities), worker["id"]))
    worker["capabilities"] = capabilities
    job = claim(connection, worker, request.app.state.settings.lease_seconds)
    if job:
        job["heartbeat_seconds"] = request.app.state.settings.heartbeat_seconds
    return {"job": job, "poll_seconds": 3, "heartbeat_seconds": request.app.state.settings.heartbeat_seconds}


class ProbeResult(BaseModel):
    id: str = Field(max_length=160)
    success: bool
    model: str = Field(max_length=200)
    message: str = Field(max_length=2000)
    observed_version: str = Field(default="", max_length=100)
    observed_model: str | None = Field(default=None, max_length=200)
    duration_ms: int = Field(ge=0)


class Heartbeat(WorkerHello):
    attempt_id: UUID | None = None
    lease_token: str = Field(default="", max_length=100)
    probe_result: ProbeResult | None = None


@router.post("/worker/heartbeat")
def heartbeat(body: Heartbeat, request: Request, authorization: str | None = Header(default=None), connection=Depends(db_connection)):
    worker = authenticate_worker(connection, authorization, lock=True)
    capabilities = body.capabilities.model_dump()
    connection.execute("UPDATE workers SET capabilities=%s,last_seen=now() WHERE id=%s", (jsonb(capabilities), worker["id"]))
    if body.probe_result and worker["probe_request"] and worker["probe_request"]["id"] == body.probe_result.id:
        connection.execute("UPDATE workers SET probe_request=NULL,probe_result=%s WHERE id=%s", (jsonb(body.probe_result.model_dump()), worker["id"]))
        worker["probe_request"] = None
    if body.attempt_id:
        task, attempt = locked_attempt(connection, body.attempt_id, worker["id"])
        require_lease(task, attempt, body.lease_token)
        connection.execute("UPDATE attempts SET lease_until=now()+%s*interval '1 second' WHERE id=%s", (request.app.state.settings.lease_seconds, body.attempt_id))
        return {"cancel": task["state"] == "CANCEL_REQUESTED", "lease_seconds": request.app.state.settings.lease_seconds,
                "heartbeat_seconds": request.app.state.settings.heartbeat_seconds}
    return {"cancel": False, "probe": worker["probe_request"]}


def owned_lease(connection, authorization, attempt_id, lease_token, *, lock=False):
    worker = authenticate_worker(connection, authorization, lock=lock)
    task, attempt = locked_attempt(connection, attempt_id, worker["id"])
    require_lease(task, attempt, lease_token)
    return worker, task, attempt


@router.get("/worker/attempts/{attempt_id}/input/{kind}")
def task_input(attempt_id: UUID, kind: str, request: Request,
               authorization: str | None = Header(default=None), x_lease_token: str | None = Header(default=None), connection=Depends(db_connection)):
    _, task, _ = owned_lease(connection, authorization, attempt_id, x_lease_token)
    if kind not in {"skill", "suite"} or (kind == "suite" and task["kind"] != "evaluate"):
        raise HTTPException(404, "任务输入不存在")
    blob = task["input"]["skill_blob" if kind == "skill" else "suite_blob"]
    return Response(request.app.state.store.get(blob), media_type="application/zip", headers={
        "X-Content-SHA256": blob, "Content-Disposition": f'attachment; filename="{kind}.zip"'})


class EventItem(BaseModel):
    sequence: int = Field(ge=1)
    payload: dict


class EventsInput(BaseModel):
    events: list[EventItem] = Field(max_length=100)


def redact(value):
    text = canonical(value)
    text = re.sub(r"(?i)(bearer\s+)[a-z0-9._~+/=-]{15,}", r"\1[REDACTED]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{16,}\b", "[REDACTED]", text)
    return json.loads(text)


@router.post("/worker/attempts/{attempt_id}/events")
def upload_events(attempt_id: UUID, body: EventsInput,
                  authorization: str | None = Header(default=None), x_lease_token: str | None = Header(default=None), connection=Depends(db_connection)):
    owned_lease(connection, authorization, attempt_id, x_lease_token, lock=True)
    maximum = connection.execute("SELECT coalesce(max(sequence),0) AS n FROM events WHERE attempt_id=%s", (attempt_id,)).fetchone()["n"]
    for event in body.events:
        payload = redact(event.payload)
        encoded = canonical(payload)
        if len(encoded.encode()) > 64 * 1024:
            raise HTTPException(413, "单条事件超过 64 KiB")
        previous = connection.execute("SELECT payload_hash FROM events WHERE attempt_id=%s AND sequence=%s", (attempt_id, event.sequence)).fetchone()
        if previous and previous["payload_hash"] != digest(encoded):
            raise HTTPException(409, "同一事件序号的内容不一致")
        if not previous:
            if event.sequence != maximum + 1:
                raise HTTPException(409, "事件序号必须连续")
            maximum = event.sequence
        connection.execute("INSERT INTO events(attempt_id,sequence,payload,payload_hash) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                           (attempt_id, event.sequence, jsonb(payload), digest(encoded)))
    maximum = connection.execute("SELECT coalesce(max(sequence),0) AS n FROM events WHERE attempt_id=%s", (attempt_id,)).fetchone()["n"]
    return {"accepted_sequence": maximum}


class Completion(BaseModel):
    exit_code: int | None = None
    error: str = Field(default="", max_length=4000)
    cancelled: bool = False
    source_digest_before: str = Field(default="", max_length=64)
    source_digest_after: str = Field(default="", max_length=64)


@router.post("/worker/attempts/{attempt_id}/complete")
def complete(attempt_id: UUID, request: Request, file: Annotated[UploadFile, File()],
             metadata: Annotated[str, Form()], authorization: str | None = Header(default=None),
             x_lease_token: str | None = Header(default=None), connection=Depends(db_connection)):
    worker = authenticate_worker(connection, authorization, lock=True)
    task, attempt = locked_attempt(connection, attempt_id, worker["id"])
    if not x_lease_token or not hmac.compare_digest(digest(x_lease_token), attempt["lease_hash"]):
        raise HTTPException(403, "执行租约不匹配")
    try:
        body = Completion.model_validate_json(metadata)
    except ValueError as error:
        raise HTTPException(422, "无效的完成信息") from error
    data = read_upload(file)
    files = unpack_zip(data)
    blob = request.app.state.store.put(data)
    receipt = digest(canonical(body.model_dump()) + blob)
    if attempt["receipt_hash"]:
        if attempt["receipt_hash"] != receipt:
            raise HTTPException(409, "该次执行已经接收了不同的结果")
        return {"accepted": True, "task_id": task["id"], "summary": attempt["summary"]}
    if (not attempt["lease_valid"] or attempt["state"] != "ACTIVE" or
            task["current_attempt_id"] != attempt["id"] or task["state"] not in {"RUNNING", "CANCEL_REQUESTED"}):
        connection.execute("UPDATE attempts SET late_blob=%s WHERE id=%s AND late_blob IS NULL", (blob, attempt_id))
        connection.execute("INSERT INTO artifacts(id,task_id,attempt_id,kind,blob) VALUES(%s,%s,%s,'late',%s) ON CONFLICT DO NOTHING", (new_id(), task["id"], attempt_id, blob))
        return JSONResponse({"detail": "租约已过期；仅保留迟到诊断，不覆盖任务状态"}, status_code=409)
    source_ok = body.source_digest_before == body.source_digest_after == task["input"]["source_digest"]
    error = redact({"message": body.error})["message"]
    cancelled = body.cancelled or task["state"] == "CANCEL_REQUESTED"
    summary, verdict = {}, None
    if task["kind"] == "evaluate":
        reports = [value for name, value in files.items() if name == "result.json" or name.endswith("/result.json")]
        try:
            raw = json.loads(reports[0].data) if len(reports) == 1 else None
        except ValueError:
            raw = None
        summary = summarize(raw, [case["id"] for case in task["input"]["cases"]], body.exit_code)
        identity_ok = (isinstance(raw, dict) and raw.get("engine_name") == "codex" and
                       isinstance(raw.get("observed_configuration"), dict) and
                       isinstance(raw.get("requested_configuration"), dict) and
                       raw["observed_configuration"].get("version") == CODEX_VERSION and
                       raw["requested_configuration"].get("model") == task["input"]["model"]["name"])
        if not source_ok or not identity_ok or error or cancelled:
            summary.update(execution_state="FAILED", verdict="INCOMPLETE")
            summary["reason"] = error or ("任务已取消" if cancelled else "源文件摘要或执行身份与冻结输入不一致")
        state, verdict = summary["execution_state"], summary["verdict"]
    else:
        candidates = {name: value for name, value in files.items() if name.startswith("evals/")}
        validation = validate_suite(candidates, request.app.state.settings.skill_up)
        draft = None
        if candidates:
            set_id = task["input"].get("set_id")
            if not set_id:
                # Freeze the first generation's ownership, but never enable it or start evaluation.
                connection.execute("SELECT id FROM skills WHERE id=%s FOR UPDATE", (task["skill_id"],))
                set_id = new_id()
                connection.execute("INSERT INTO evaluation_sets(id,skill_id,name) VALUES(%s,%s,%s)", (set_id, task["skill_id"], "生成的评测集"))
                connection.execute("UPDATE skills SET default_set_id=coalesce(default_set_id,%s) WHERE id=%s", (set_id, task["skill_id"]))
            draft = create_draft(connection, request.app.state.store, set_id, task["input"]["skill_version_id"], candidates, validation=validation)
        actual = len(validation["cases"])
        state = "SUCCEEDED" if body.exit_code == 0 and source_ok and validation["valid"] and not error else "FAILED"
        summary = {"draft_id": str(draft["id"]) if draft else None, "set_id": str(draft["set_id"]) if draft else None,
                   "target_count": task["input"]["count"], "actual_count": actual, "validation": validation,
                   "count_notice": "实际数量与目标不同，请检查草稿" if actual != task["input"]["count"] else None,
                   "reason": error or (None if source_ok else "生成过程未通过源文件摘要检查")}
    if cancelled:
        state = "CANCELLED"
    summary["html_available"] = len([name for name in files if name == "report.html" or name.endswith("/report.html")]) == 1
    connection.execute("UPDATE attempts SET state=%s,receipt_hash=%s,result_blob=%s,summary=%s,finished_at=now() WHERE id=%s",
                       ("CANCELLED" if cancelled else "COMPLETED", receipt, blob, jsonb(summary), attempt_id))
    connection.execute("UPDATE tasks SET state=%s,verdict=%s,summary=%s,finished_at=now(),state_version=state_version+1 WHERE id=%s",
                       (state, verdict, jsonb(summary), task["id"]))
    connection.execute("INSERT INTO artifacts(id,task_id,attempt_id,kind,blob) VALUES(%s,%s,%s,%s,%s)",
                       (new_id(), task["id"], attempt_id, "report" if task["kind"] == "evaluate" else "generation", blob))
    return {"accepted": True, "task_id": task["id"], "summary": summary}
