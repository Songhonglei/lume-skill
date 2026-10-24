"""PostgreSQL queue and lease rules, shared by both job kinds."""
from __future__ import annotations

import hmac
import secrets

from fastapi import HTTPException

from backend.common import digest, jsonb, new_id, required
from worker.engine import CODEX_VERSION, SKILL_UP_VERSION

TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "INTERRUPTED"}


def expire_leases(connection):
    rows = connection.execute(
        """SELECT t.id,t.kind,t.current_attempt_id FROM tasks t JOIN attempts a ON a.id=t.current_attempt_id
           WHERE t.state IN ('RUNNING','CANCEL_REQUESTED') AND a.state='ACTIVE' AND a.lease_until<=now()
           FOR UPDATE OF t SKIP LOCKED""").fetchall()
    for row in rows:
        summary = {"reason": "Worker 连接超时，原执行已中断；不会自动重跑"}
        connection.execute("UPDATE attempts SET state='EXPIRED',summary=%s,finished_at=now() WHERE id=%s AND state='ACTIVE'",
                           (jsonb(summary), row["current_attempt_id"]))
        connection.execute("UPDATE tasks SET state='INTERRUPTED',verdict=%s,summary=%s,finished_at=now(),state_version=state_version+1 WHERE id=%s",
                           ("INCOMPLETE" if row["kind"] == "evaluate" else None, jsonb(summary), row["id"]))


def capable(capabilities: dict, frozen: dict) -> bool:
    model = frozen["model"]
    return (capabilities.get("skill_up_version") == SKILL_UP_VERSION and
            capabilities.get("codex_version") == CODEX_VERSION and
            capabilities.get("login_configured") is True and
            capabilities.get("connection_fingerprint") == model["connection_fingerprint"])


def authenticate_worker(connection, authorization: str | None, *, lock=False):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "需要 Worker 接入凭据")
    token = authorization.removeprefix("Bearer ")
    row = connection.execute("SELECT * FROM workers WHERE token_hash=%s AND NOT revoked" + (" FOR UPDATE" if lock else ""),
                             (digest(token),)).fetchone()
    if row is None:
        raise HTTPException(401, "Worker 接入已失效或被撤销，请重新接入")
    return row


def locked_attempt(connection, attempt_id, worker_id):
    hint = required(connection.execute("SELECT task_id FROM attempts WHERE id=%s AND worker_id=%s", (attempt_id, worker_id)).fetchone(), "该执行不属于当前 Worker")
    task = required(connection.execute("SELECT * FROM tasks WHERE id=%s FOR UPDATE", (hint["task_id"],)).fetchone())
    attempt = required(connection.execute("SELECT *,lease_until>now() AS lease_valid FROM attempts WHERE id=%s FOR UPDATE", (attempt_id,)).fetchone())
    return task, attempt


def require_lease(task, attempt, lease_token):
    if not lease_token or not hmac.compare_digest(digest(lease_token), attempt["lease_hash"]):
        raise HTTPException(403, "执行租约不匹配")
    if (not attempt["lease_valid"] or attempt["state"] != "ACTIVE" or
            task["current_attempt_id"] != attempt["id"] or task["state"] not in {"RUNNING", "CANCEL_REQUESTED"}):
        raise HTTPException(409, "执行租约已过期；请停止当前进程，不能覆盖已有结果")


def claim(connection, worker, lease_seconds):
    expire_leases(connection)
    if connection.execute("SELECT 1 FROM attempts WHERE worker_id=%s AND state='ACTIVE'", (worker["id"],)).fetchone():
        return None
    # Matching is deliberately simple: exact engine versions and selected connection.
    row = connection.execute(
        """SELECT * FROM tasks WHERE state='QUEUED'
           AND input->'model'->>'connection_fingerprint'=%s
           ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1""",
        (worker["capabilities"].get("connection_fingerprint", ""),)).fetchone()
    if row is None or not capable(worker["capabilities"], row["input"]):
        return None
    attempt_id, lease = new_id(), secrets.token_urlsafe(32)
    number = connection.execute("SELECT coalesce(max(number),0)+1 AS n FROM attempts WHERE task_id=%s", (row["id"],)).fetchone()["n"]
    connection.execute("""INSERT INTO attempts(id,task_id,number,worker_id,lease_hash,lease_until,state)
                           VALUES(%s,%s,%s,%s,%s,now()+%s*interval '1 second','ACTIVE')""",
                       (attempt_id, row["id"], number, worker["id"], digest(lease), lease_seconds))
    connection.execute("UPDATE tasks SET state='RUNNING',current_attempt_id=%s,state_version=state_version+1 WHERE id=%s", (attempt_id, row["id"]))
    return {"task_id": row["id"], "kind": row["kind"], "input": row["input"],
            "attempt_id": attempt_id, "attempt_number": number, "lease_token": lease,
            "lease_seconds": lease_seconds}
