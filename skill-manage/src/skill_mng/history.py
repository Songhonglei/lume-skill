"""Read-only history pages with insertion snapshots and scoped keyset cursors."""

import base64
import binascii
import json
from hashlib import sha256

from .db import transaction
from .tasks import recover_expired


def _scope(user, kind, filters):
    return sha256(json.dumps([user["id"], kind, filters], sort_keys=True).encode()).hexdigest()


def _position(cursor, scope, maximum, ascending=False):
    if not cursor:
        return maximum, 0 if ascending else maximum + 1
    try:
        if len(cursor) > 1024:
            raise ValueError
        raw = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        value = json.loads(raw)
        if (
            not isinstance(value, dict)
            or set(value) != {"v", "scope", "snapshot", "position"}
            or type(value["v"]) is not int
            or value["v"] != 1
            or value["scope"] != scope
            or any(type(value[k]) is not int for k in ("snapshot", "position"))
            or not 0 <= value["position"] <= value["snapshot"] <= 2**63 - 1
        ):
            raise ValueError
        return value["snapshot"], value["position"]
    except (ValueError, TypeError, binascii.Error, UnicodeError):
        raise ValueError("分页游标无效或不适用于当前筛选，请刷新列表") from None


def _page(rows, limit, scope, snapshot):
    more = len(rows) > limit
    rows = [dict(row) for row in rows[:limit]]
    position = rows[-1]["_position"] if rows else 0
    for row in rows:
        row.pop("_position")
    cursor = None
    if more:
        cursor = (
            base64.urlsafe_b64encode(
                json.dumps({"v": 1, "scope": scope, "snapshot": snapshot, "position": position}).encode()
            )
            .decode()
            .rstrip("=")
        )
    return {"items": rows, "hasMore": more, "nextCursor": cursor}


def _task_view(row):
    # Drop large frozen bodies as each row is read, before collecting a history page.
    item = dict(row)
    repair_report = item.pop("repair_has_report")
    item["report_available"] = (
        bool(repair_report) if item["kind"] == "repair" else item["delivery_status"] == "saved"
    )
    raw = item.pop("result_json")
    result = json.loads(raw) if raw else {}
    manifest = json.loads(item.pop("manifest_json"))
    item.update(
        audit_mode=manifest.get("mode"),
        score=result.get("score"),
        max_score=result.get("maxScore"),
        error_count=result.get("errorCount"),
        warning_count=result.get("warningCount"),
        review_required=result.get("reviewRequired", True),
    )
    return item


def task_history(
    root, user, *, limit, cursor=None, q="", state=None, skill_id=None, kind=None, version_id=None
):
    q = q.strip()
    scope = _scope(user, "tasks", [q, state, skill_id, kind, version_id])
    with transaction(root, write=True) as db:
        recover_expired(db)
        maximum = db.execute("SELECT COALESCE(MAX(rowid),0) FROM tasks").fetchone()[0]
        snapshot, before = _position(cursor, scope, maximum)
        clauses, args = ["t.rowid<=?", "t.rowid<?"], [snapshot, before]
        for column, value in (
            ("t.state", state),
            ("v.skill_id", skill_id),
            ("t.kind", kind),
            ("v.id", version_id),
        ):
            if value:
                clauses.append(column + "=?")
                args.append(value)
        if q:
            query = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            clauses.append(
                "("
                + " OR ".join(c + " LIKE ? ESCAPE '\\'" for c in ("t.id", "s.name", "s.slug", "v.version"))
                + ")"
            )
            args.extend([query] * 4)
        joins = (
            " FROM tasks t JOIN versions v ON v.id=t.version_id JOIN skills s ON s.id=v.skill_id "
            "LEFT JOIN audit_runs a ON a.id=t.audit_run_id LEFT JOIN repair_runs r ON r.id=t.repair_run_id "
            "LEFT JOIN published_repairs resolved ON resolved.audit_run_id=a.id AND resolved.rank=1 "
            "LEFT JOIN versions published ON published.id=COALESCE(r.published_version_id,resolved.published_version_id) "
        )
        published_repairs = (
            "WITH published_repairs AS (SELECT audit_run_id,published_version_id,"
            "ROW_NUMBER() OVER (PARTITION BY audit_run_id ORDER BY finished_at DESC,id DESC) AS rank "
            "FROM repair_runs WHERE state='published' AND published_version_id IS NOT NULL) "
        )
        # Count the same filtered insertion snapshot, not just this cursor's page.
        summary = dict(
            db.execute(
                published_repairs
                + "SELECT COUNT(*) AS total,COALESCE(SUM(t.state IN ('queued','running','cancelling')),0) AS active,"
                "COALESCE(SUM(t.state IN ('failed','waiting_configuration') "
                "OR (a.verdict IN ('fail','review_required','error') AND resolved.published_version_id IS NULL) "
                "OR r.state='needs_attention'),0) AS attention"
                + joins
                + "WHERE "
                + " AND ".join([clauses[0], *clauses[2:]]),
                [args[0], *args[2:]],
            ).fetchone()
        )
        query = db.execute(
            published_repairs
            + "SELECT t.rowid AS _position,t.id,t.kind,t.repair_run_id,t.version_id,t.state,t.created_at,"
            "t.finished_at,t.failure_code,t.audit_run_id,t.lease_generation,s.name AS skill_name,s.owner_id,"
            "v.skill_id,v.version,a.verdict,a.delivery_status,a.depth,a.result_json,t.manifest_json,"
            "r.state AS repair_state,published.id AS published_version_id,published.version AS published_version,"
            "EXISTS(SELECT 1 FROM repair_rounds rr WHERE rr.repair_run_id=r.id AND rr.review_json IS NOT NULL) AS repair_has_report"
            + joins
            + "WHERE "
            + " AND ".join(clauses)
            + " ORDER BY t.rowid DESC LIMIT ?",
            [*args, limit + 1],
        )
        rows = [_task_view(row) for row in query]
    page = _page(rows, limit, scope, snapshot)
    page["summary"] = summary
    return page


def event_history(root, user, task_id, *, limit, cursor=None):
    scope = _scope(user, "events", task_id)
    with transaction(root) as db:
        task = db.execute("SELECT audit_run_id,repair_run_id FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not task:
            from fastapi import HTTPException

            raise HTTPException(404, "任务不存在")
        subjects = (task_id, task["audit_run_id"], task["repair_run_id"])
        maximum = db.execute(
            "SELECT COALESCE(MAX(id),0) FROM events WHERE subject_id IN (?,?,?)", subjects
        ).fetchone()[0]
        snapshot, after = _position(cursor, scope, maximum, ascending=True)
        rows = db.execute(
            "SELECT id AS _position,id,kind,detail_json,created_at FROM events WHERE subject_id IN (?,?,?) AND id>? AND id<=? ORDER BY id LIMIT ?",
            (*subjects, after, snapshot, limit + 1),
        ).fetchall()
    return _page(rows, limit, scope, snapshot)


def enrollment_history(root, user, *, limit, cursor=None):
    scope = _scope(user, "enrollments", [])
    with transaction(root) as db:
        maximum = db.execute("SELECT COALESCE(MAX(rowid),0) FROM worker_enrollments").fetchone()[0]
        snapshot, before = _position(cursor, scope, maximum)
        rows = db.execute(
            "SELECT rowid AS _position,id,expires_at,consumed_at,revoked_at,worker_id,created_at FROM worker_enrollments WHERE rowid<=? AND rowid<? ORDER BY rowid DESC LIMIT ?",
            (snapshot, before, limit + 1),
        ).fetchall()
    return _page(rows, limit, scope, snapshot)
