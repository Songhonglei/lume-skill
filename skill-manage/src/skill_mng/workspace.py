"""Small, version-bound read models for the workspace; never return report bodies."""

import json

from .registry import may_write


def audit_summary(row):
    if not row or not row["audit_id"]:
        return None
    result = json.loads(row["result_json"]) if row["result_json"] else {}
    manifest = json.loads(row["manifest_json"]) if row["manifest_json"] else {}
    return {
        "id": row["audit_id"],
        "task_id": row["task_id"],
        "version_id": row["version_id"],
        "state": row["task_state"],
        "mode": manifest.get("mode", "full"),
        "depth": row["depth"],
        "verdict": row["verdict"],
        "delivery_status": row["delivery_status"],
        "created_at": row["audit_created_at"],
        "score": result.get("score"),
        "max_score": result.get("maxScore"),
        "error_count": result.get("errorCount"),
        "warning_count": result.get("warningCount"),
        "review_required": result.get("reviewRequired", True),
    }


def latest_audits(db, skill_id=None):
    """One bulk query, deterministic even when several runs share a timestamp."""
    scope = " WHERE v.skill_id=?" if skill_id else ""
    rows = db.execute(
        "WITH ranked AS (SELECT a.id,a.version_id,"
        "ROW_NUMBER() OVER (PARTITION BY a.version_id ORDER BY a.rowid DESC) AS rank "
        "FROM audit_runs a JOIN versions v ON v.id=a.version_id"
        + scope
        + ") SELECT a.id AS audit_id,a.version_id,a.depth,a.verdict,a.delivery_status,"
        "a.result_json,a.created_at AS audit_created_at,t.id AS task_id,"
        "t.state AS task_state,t.manifest_json FROM ranked x JOIN audit_runs a ON a.id=x.id "
        "LEFT JOIN tasks t ON t.audit_run_id=a.id AND t.kind='audit' WHERE x.rank=1",
        (skill_id,) if skill_id else (),
    )
    return {row["version_id"]: audit_summary(row) for row in rows}


def skill_list(db, user):
    audits = latest_audits(db)
    rows = db.execute(
        "SELECT s.*,u.username AS owner,v.version AS current_version,"
        "(SELECT count(*) FROM versions x WHERE x.skill_id=s.id) AS version_count,"
        "(SELECT MAX(x.created_at) FROM versions x WHERE x.skill_id=s.id) AS updated_at "
        "FROM skills s JOIN users u ON u.id=s.owner_id "
        "LEFT JOIN versions v ON v.id=s.current_version_id ORDER BY s.created_at DESC,s.rowid DESC"
    ).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["can_write"] = may_write(user, row)
        item["latest_audit"] = audits.get(row["current_version_id"])
        audit_time = (item["latest_audit"] or {}).get("created_at")
        item["updated_at"] = max(filter(None, (item["updated_at"], audit_time, item["created_at"])))
        results.append(item)
    return results
