"""Server-owned worker credentials, attempt leases and immutable task identities."""

import json
import secrets
import time
from pathlib import Path

from .auth import digest, new_id, now
from .db import transaction
from .registry import may_write, record_event

LEASE_SECONDS = 30
RULE_VERSION = "deep-audit-1.2.0-platform.1"
TERMINAL = {"succeeded", "failed", "cancelled"}


class Conflict(ValueError):
    pass


def create_enrollment(root: Path, actor: str) -> dict:
    code, enrollment_id = secrets.token_urlsafe(24), new_id()
    expires = int(time.time()) + 600
    with transaction(root, write=True) as db:
        db.execute(
            "INSERT INTO worker_enrollments(id,code_hash,expires_at,created_by,created_at) VALUES (?,?,?,?,?)",
            (enrollment_id, digest(code), expires, actor, now()),
        )
        record_event(db, actor, "worker.enrollment_created", enrollment_id)
    return {"id": enrollment_id, "code": code, "expires_at": expires}


def redeem(root: Path, code: str, name: str) -> dict:
    if not name.strip() or len(name) > 80:
        raise ValueError("worker 名称需为 1–80 字符")
    credential, worker_id = secrets.token_urlsafe(32), new_id()
    with transaction(root, write=True) as db:
        enrollment = db.execute(
            "SELECT * FROM worker_enrollments WHERE code_hash=?", (digest(code),)
        ).fetchone()
        if (
            not enrollment
            or enrollment["expires_at"] <= int(time.time())
            or enrollment["consumed_at"]
            or enrollment["revoked_at"]
        ):
            raise PermissionError("授权码无效、已使用或已过期；请管理员生成新码")
        db.execute(
            "INSERT INTO workers(id,name,credential_hash,state,created_at) VALUES (?,?,?,?,?)",
            (worker_id, name.strip(), digest(credential), "registered", now()),
        )
        db.execute(
            "UPDATE worker_enrollments SET consumed_at=?,worker_id=? WHERE id=?",
            (now(), worker_id, enrollment["id"]),
        )
        record_event(db, worker_id, "worker.enrolled", worker_id)
    return {"id": worker_id, "credential": credential}


def worker_auth(root: Path, credential: str) -> dict:
    with transaction(root) as db:
        row = db.execute(
            "SELECT id,name,state FROM workers WHERE credential_hash=? AND revoked_at IS NULL",
            (digest(credential),),
        ).fetchone()
    if not row:
        raise PermissionError("worker 凭据无效或已撤销，请重新接入")
    return dict(row)


def builtin_worker(root: Path, credential_path: Path, server_url: str) -> None:
    """Trusted server bootstrap only; runner receives a machine credential, never SQLite access."""
    from .config import write_secret_json

    if credential_path.exists():
        return  # Never silently restore an administrator-revoked machine.
    worker_id, credential = new_id(), secrets.token_urlsafe(32)
    with transaction(root, write=True) as db:
        db.execute(
            "INSERT INTO workers(id,name,credential_hash,state,created_at) VALUES (?,?,?,?,?)",
            (worker_id, "内置 worker", digest(credential), "registered", now()),
        )
    write_secret_json(
        credential_path, {"id": worker_id, "credential": credential, "server": server_url, "builtin": True}
    )


def revoke_worker(root: Path, worker_id: str, actor: str) -> None:
    with transaction(root, write=True) as db:
        if not db.execute(
            "UPDATE workers SET revoked_at=?,state='revoked' WHERE id=?", (now(), worker_id)
        ).rowcount:
            raise ValueError("worker 不存在")
        # Revoke active leases immediately. Next claim recovers or finalizes these tasks.
        db.execute(
            "UPDATE task_attempts SET lease_until=0 WHERE worker_id=? AND state IN ('leased','running')",
            (worker_id,),
        )
        record_event(db, actor, "worker.revoked", worker_id)


def create_task(root: Path, user: dict, version_id: str, depth: str, mode: str, idempotency_key: str) -> dict:
    if depth not in ("L1", "L2") or mode not in ("static", "full"):
        raise ValueError("请选择 L1/L2 和 static/full 审计方式")
    if not idempotency_key or len(idempotency_key) > 128:
        raise ValueError("需要 1–128 字符的幂等键")
    from .models import public_model_config

    config = public_model_config(root)
    with transaction(root, write=True) as db:
        version = db.execute(
            "SELECT v.*,s.owner_id,a.digest AS artifact_digest FROM versions v JOIN skills s ON s.id=v.skill_id JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=?",
            (version_id,),
        ).fetchone()
        if not version:
            raise ValueError("版本不存在")
        if not may_write(user, version):
            raise PermissionError("仅维护者或管理员可创建审计")
        previous = db.execute("SELECT * FROM tasks WHERE idempotency_key=?", (idempotency_key,)).fetchone()
        if previous:
            old = json.loads(previous["manifest_json"])
            if previous["created_by"] != user["id"] or (
                previous["version_id"],
                old["depth"],
                old["mode"],
            ) != (version_id, depth, mode):
                raise Conflict("幂等键已用于其他请求")
            return {"task_id": previous["id"], "audit_run_id": previous["audit_run_id"], "reused": True}
        task_id, run_id = new_id(), new_id()
        manifest = {
            "schemaVersion": 1,
            "taskId": task_id,
            "auditRunId": run_id,
            "skillId": version["skill_id"],
            "versionId": version_id,
            "registeredVersion": version["version"],
            "contentDigest": version["content_digest"],
            "artifactDigest": version["artifact_digest"],
            "depth": depth,
            "mode": mode,
            "ruleVersion": RULE_VERSION,
            "modelRevision": config.get("revision"),
            "limits": {"durationSeconds": 300, "modelCalls": 16, "fileBytes": 262144},
        }
        state = "queued" if mode == "static" or config.get("ready") else "waiting_configuration"
        db.execute(
            "INSERT INTO audit_runs(id,version_id,depth,rule_version,created_at) VALUES (?,?,?,?,?)",
            (run_id, version_id, depth, RULE_VERSION, now()),
        )
        db.execute(
            "INSERT INTO tasks(id,version_id,kind,state,idempotency_key,manifest_json,created_by,created_at,audit_run_id,available_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                task_id,
                version_id,
                "audit",
                state,
                idempotency_key,
                json.dumps(manifest),
                user["id"],
                now(),
                run_id,
                int(time.time()),
            ),
        )
        record_event(db, user["id"], "task.created", task_id, {"mode": mode, "depth": depth})
    return {"task_id": task_id, "audit_run_id": run_id, "reused": False}


def recover_expired(db) -> None:
    current = int(time.time())
    expired = db.execute(
        "SELECT a.*,t.cancel_requested,t.max_attempts,t.audit_run_id FROM task_attempts a JOIN tasks t ON t.id=a.task_id WHERE a.state IN ('leased','running') AND a.lease_until<=?",
        (current,),
    ).fetchall()
    for attempt in expired:
        db.execute(
            "UPDATE task_attempts SET state='expired',error_code='lease_expired',updated_at=? WHERE id=?",
            (now(), attempt["id"]),
        )
        count = db.execute(
            "SELECT count(*) FROM task_attempts WHERE task_id=?", (attempt["task_id"],)
        ).fetchone()[0]
        state = (
            "cancelled"
            if attempt["cancel_requested"]
            else "failed"
            if count >= attempt["max_attempts"]
            else "queued"
        )
        db.execute(
            "UPDATE tasks SET state=?,available_at=?,failure_code='lease_expired',finished_at=? WHERE id=?",
            (state, current + min(2**count, 30), now() if state in TERMINAL else None, attempt["task_id"]),
        )
        if state in TERMINAL:
            db.execute(
                "UPDATE repair_runs SET state=?,failure_code='lease_expired',finished_at=? WHERE task_id=?",
                ("cancelled" if state == "cancelled" else "needs_attention", now(), attempt["task_id"]),
            )
            db.execute(
                "UPDATE audit_runs SET verdict='error',delivery_status='failed' WHERE id=?",
                (attempt["audit_run_id"],),
            )


def claim(root: Path, worker_id: str) -> dict | None:
    with transaction(root, write=True) as db:
        current = int(time.time())
        recover_expired(db)
        if not db.execute("SELECT 1 FROM workers WHERE id=? AND revoked_at IS NULL", (worker_id,)).fetchone():
            raise PermissionError("worker 已撤销")
        db.execute("UPDATE workers SET state='online',last_seen_at=? WHERE id=?", (now(), worker_id))
        if db.execute(
            "SELECT 1 FROM task_attempts WHERE state IN ('leased','running') AND lease_until>? LIMIT 1",
            (current,),
        ).fetchone():
            return None
        task = db.execute(
            "SELECT * FROM tasks WHERE state='queued' AND available_at<=? ORDER BY created_at LIMIT 1",
            (current,),
        ).fetchone()
        if not task:
            return None
        attempt_id, generation = new_id(), task["lease_generation"] + 1
        db.execute(
            "INSERT INTO task_attempts(id,task_id,worker_id,generation,lease_until,state,updated_at) VALUES (?,?,?,?,?,'running',?)",
            (attempt_id, task["id"], worker_id, generation, current + LEASE_SECONDS, now()),
        )
        db.execute(
            "UPDATE tasks SET state='running',lease_generation=?,failure_code=NULL,failure_message=NULL WHERE id=?",
            (generation, task["id"]),
        )
        db.execute(
            "UPDATE repair_runs SET state='editing' WHERE task_id=? AND state='pending'", (task["id"],)
        )
        manifest = json.loads(task["manifest_json"])
        manifest.update(attemptId=attempt_id, leaseGeneration=generation)
        record_event(
            db, worker_id, "task.claimed", task["id"], {"attempt": attempt_id, "generation": generation}
        )
        return manifest


def valid_attempt(db, worker_id: str, attempt_id: str, generation: int, *, allow_cancel: bool = False):
    row = db.execute(
        "SELECT a.*,t.state AS task_state,t.cancel_requested,t.manifest_json,t.audit_run_id,t.model_calls,t.id AS task_id,w.revoked_at "
        ",t.lease_generation AS current_generation FROM task_attempts a JOIN tasks t ON t.id=a.task_id JOIN workers w ON w.id=a.worker_id WHERE a.id=?",
        (attempt_id,),
    ).fetchone()
    if (
        not row
        or row["worker_id"] != worker_id
        or row["revoked_at"]
        or row["generation"] != generation
        or row["current_generation"] != generation
    ):
        raise Conflict("attempt 身份无效或已撤销")
    if (
        row["state"] not in ("leased", "running")
        or row["lease_until"] <= int(time.time())
        or row["task_state"] in TERMINAL
    ):
        raise Conflict("租约已过期或任务已结束，拒绝迟到结果")
    if row["cancel_requested"] and not allow_cancel:
        raise Conflict("任务已请求停止，拒绝继续执行或提交")
    return row


def heartbeat(root: Path, worker_id: str, attempt_id: str, generation: int) -> dict:
    with transaction(root, write=True) as db:
        row = valid_attempt(db, worker_id, attempt_id, generation, allow_cancel=True)
        if not row["cancel_requested"]:
            db.execute(
                "UPDATE task_attempts SET lease_until=?,updated_at=? WHERE id=?",
                (int(time.time()) + LEASE_SECONDS, now(), attempt_id),
            )
        db.execute("UPDATE workers SET state='online',last_seen_at=? WHERE id=?", (now(), worker_id))
        return {"cancel_requested": bool(row["cancel_requested"]), "lease_seconds": LEASE_SECONDS}


def cancel_task(root: Path, task_id: str, user: dict):
    with transaction(root, write=True) as db:
        task = db.execute(
            "SELECT t.*,s.owner_id FROM tasks t JOIN versions v ON v.id=t.version_id JOIN skills s ON s.id=v.skill_id WHERE t.id=?",
            (task_id,),
        ).fetchone()
        if not task:
            raise ValueError("任务不存在")
        if not may_write(user, task):
            raise PermissionError("无权停止此任务")
        if task["state"] in TERMINAL:
            return {"state": task["state"]}
        state = "cancelling" if task["state"] in {"running", "cancelling"} else "cancelled"
        db.execute(
            "UPDATE tasks SET state=?,cancel_requested=1,finished_at=? WHERE id=?",
            (state, now() if state == "cancelled" else None, task_id),
        )
        if state == "cancelled":
            db.execute(
                "UPDATE repair_runs SET state='cancelled',finished_at=? WHERE task_id=?", (now(), task_id)
            )
            db.execute(
                "UPDATE audit_runs SET verdict='error',delivery_status='failed' WHERE id=?",
                (task["audit_run_id"],),
            )
        record_event(db, user["id"], "task.cancel_requested", task_id)
    return {"state": state}


def fail_attempt(
    root: Path, worker_id: str, attempt_id: str, generation: int, code: str, retryable: bool = False
):
    allowed = {
        "network_error",
        "model_unavailable",
        "configuration_changed",
        "invalid_result",
        "checker_error",
        "cancelled",
        "timeout",
        "worker_error",
        "delivery_failed",
    }
    if code not in allowed:
        raise ValueError("未知失败分类")
    with transaction(root, write=True) as db:
        row = valid_attempt(db, worker_id, attempt_id, generation, allow_cancel=True)
        cancelled = row["cancel_requested"] or code == "cancelled"
        attempt_state = "cancelled" if cancelled else "failed"
        db.execute(
            "UPDATE task_attempts SET state=?,error_code=?,updated_at=? WHERE id=?",
            (attempt_state, code, now(), attempt_id),
        )
        task = db.execute("SELECT * FROM tasks WHERE id=?", (row["task_id"],)).fetchone()
        count = db.execute(
            "SELECT count(*) FROM task_attempts WHERE task_id=?", (row["task_id"],)
        ).fetchone()[0]
        can_retry = (
            retryable and code in {"network_error", "model_unavailable"} and count < task["max_attempts"]
        )
        state = "cancelled" if cancelled else "queued" if can_retry else "failed"
        db.execute(
            "UPDATE tasks SET state=?,available_at=?,failure_code=?,finished_at=? WHERE id=?",
            (
                state,
                int(time.time()) + min(2**count, 30),
                code,
                now() if state in TERMINAL else None,
                row["task_id"],
            ),
        )
        if state in TERMINAL:
            db.execute(
                "UPDATE repair_runs SET state=?,failure_code=?,finished_at=? WHERE task_id=?",
                ("cancelled" if state == "cancelled" else "needs_attention", code, now(), row["task_id"]),
            )
            db.execute(
                "UPDATE audit_runs SET verdict='error',delivery_status='failed' WHERE id=?",
                (row["audit_run_id"],),
            )
        record_event(
            db, worker_id, "task.attempt_failed", row["task_id"], {"code": code, "retryable": can_retry}
        )
    return {"state": state}
