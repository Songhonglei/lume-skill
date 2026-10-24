"""Shared bundled rule implementation and server-side report acceptance gate."""

import hashlib
import importlib.util
import json
from functools import lru_cache
from pathlib import Path

from .auth import now
from .db import transaction
from .registry import record_event
from .privacy import TargetPrivacy, redact
from .tasks import Conflict, valid_attempt

SKILL_ROOT = Path(__file__).parent / "resources/skills/skill-deep-audit"


@lru_cache
def engine():
    spec = importlib.util.spec_from_file_location(
        "_bundled_static_audit", SKILL_ROOT / "scripts/audit_package.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(
        module
    )  # This path is bundled application code, never selected by a target package.
    return module


def freeze_audit(
    manifest, findings, checked, completed, *, scope_satisfied=False, scope_reason="", privacy=None
):
    if manifest.get("repairScope") and (
        type(scope_satisfied) is not bool or not isinstance(scope_reason, str) or len(scope_reason) > 1000
    ):
        raise ValueError("授权范围复核格式无效")
    mask = privacy.redact if privacy else redact
    safe_findings = []
    for row in findings:
        safe = {**row, **{key: mask(row[key]) for key in ("message", "suggestion", "verification")}}
        safe["id"] = engine().finding(safe["ruleId"], safe["message"], safe["file"], safe.get("line"))["id"]
        safe_findings.append(safe)
    findings = safe_findings
    scope_reason = mask(scope_reason)
    result = engine().freeze_result(manifest, findings, checked, completed)
    if manifest.get("repairScope"):
        result.update(
            scopeSatisfied=scope_satisfied,
            scopeReason=scope_reason,
            repairRunId=manifest["repairScope"]["repairRunId"],
            repairRound=manifest["repairRound"],
            sourceVersionId=manifest["authorization"]["sourceVersionId"],
        )
        if not scope_satisfied:
            result["reviewRequired"] = True
            if result["verdict"] == "pass":
                result["verdict"] = "review_required"
        result["reportMarkdown"] = (
            engine().render_report(result)
            + "\n## 授权范围复核\n\n"
            + str(scope_satisfied)
            + ": "
            + scope_reason
            + "\n"
        )
        result["reportDigest"] = hashlib.sha256(result["reportMarkdown"].encode()).hexdigest()
    return result


def validate_result(result: dict, manifest: dict) -> dict:
    if result.get("schemaVersion") != 1 or len(json.dumps(result)) > 2 * 1024 * 1024:
        raise ValueError("审计结果格式或大小不正确")
    for key in (
        "taskId",
        "attemptId",
        "leaseGeneration",
        "auditRunId",
        "versionId",
        "contentDigest",
        "artifactDigest",
        "depth",
        "ruleVersion",
    ):
        if result.get(key) != manifest.get(key):
            raise Conflict("结果身份与固定任务不匹配：" + key)
    findings = result.get("findings")
    if not isinstance(findings, list) or len(findings) > 500:
        raise ValueError("问题列表格式或数量不正确")
    for row in findings:
        if not isinstance(row, dict):
            raise ValueError("问题条目必须为对象")
        if set(row) - {
            "id",
            "ruleId",
            "file",
            "line",
            "message",
            "suggestion",
            "verification",
            "reviewRequired",
            "severity",
            "points",
        }:
            raise ValueError("问题包含未声明字段")
        if not all(
            isinstance(row.get(k), str)
            for k in ("id", "ruleId", "file", "message", "suggestion", "verification")
        ):
            raise ValueError("问题字段不完整")
        if row["id"] != engine().finding(row["ruleId"], row["message"], row["file"], row.get("line"))["id"]:
            raise ValueError("问题 ID 与固定证据不一致")
        if any(len(row[k]) > 4000 for k in ("suggestion", "verification")):
            raise ValueError("问题建议或验证说明过长")
    rebuilt = freeze_audit(
        manifest,
        findings,
        result.get("checkedRuleIds", []),
        result.get("semanticCompleted", False),
        scope_satisfied=result.get("scopeSatisfied", False),
        scope_reason=result.get("scopeReason", ""),
    )
    if set(result) != set(rebuilt):
        raise ValueError("审计结果包含未声明字段或缺少必要字段")
    if manifest.get("repairScope"):
        for key in ("scopeSatisfied", "scopeReason", "repairRunId", "repairRound", "sourceVersionId"):
            if result.get(key) != rebuilt[key]:
                raise ValueError("授权复核身份或口径不一致：" + key)
    if manifest["mode"] == "static" and result.get("semanticCompleted"):
        raise ValueError("静态预检不能声明语义审计已完成")
    for key in (
        "score",
        "maxScore",
        "errorCount",
        "warningCount",
        "reviewRequired",
        "verdict",
        "findings",
        "reportMarkdown",
        "reportDigest",
        "repairPrompt",
    ):
        if result.get(key) != rebuilt[key]:
            raise ValueError("审计结果口径或报告摘要不一致：" + key)
    return rebuilt


def submit_result(root: Path, worker_id: str, attempt_id: str, generation: int, result: dict) -> dict:
    canonical = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    result_digest = hashlib.sha256(canonical.encode()).hexdigest()
    with transaction(root, write=True) as db:
        previous = db.execute(
            "SELECT a.*,w.revoked_at FROM task_attempts a JOIN workers w ON w.id=a.worker_id WHERE a.id=?",
            (attempt_id,),
        ).fetchone()
        if previous and previous["state"] == "succeeded":
            if (
                previous["worker_id"] != worker_id
                or previous["revoked_at"]
                or previous["generation"] != generation
                or previous["result_digest"] != result_digest
            ):
                raise Conflict("已完成 attempt 的结果不能被覆盖")
            return {"saved": True, "reused": True, "report_digest": result["reportDigest"]}
        row = valid_attempt(db, worker_id, attempt_id, generation)
        manifest = json.loads(row["manifest_json"])
        manifest.update(attemptId=attempt_id, leaseGeneration=generation)
        from .repair_packages import unpack

        _, files = unpack((root / "objects" / (manifest["artifactDigest"] + ".zip")).read_bytes())
        checked = validate_result(result, manifest)
        TargetPrivacy(files).validate_report(checked)
        db.execute(
            "UPDATE audit_runs SET verdict=?,delivery_status='saved',report_digest=?,result_json=? WHERE id=?",
            (checked["verdict"], checked["reportDigest"], canonical, row["audit_run_id"]),
        )
        for finding in checked["findings"]:
            db.execute(
                "INSERT INTO findings VALUES (?,?,?,?,?,?)",
                (
                    row["audit_run_id"] + ":" + finding["id"],
                    row["audit_run_id"],
                    finding["ruleId"],
                    finding["severity"],
                    int(finding["reviewRequired"]),
                    json.dumps(finding, ensure_ascii=False),
                ),
            )
        db.execute(
            "UPDATE task_attempts SET state='succeeded',result_digest=?,updated_at=? WHERE id=?",
            (result_digest, now(), attempt_id),
        )
        db.execute(
            "UPDATE tasks SET state='succeeded',finished_at=?,failure_code=NULL WHERE id=?",
            (now(), row["task_id"]),
        )
        record_event(
            db,
            worker_id,
            "audit.saved",
            row["audit_run_id"],
            {"verdict": checked["verdict"], "report_digest": checked["reportDigest"]},
        )
    return {"saved": True, "reused": False, "report_digest": checked["reportDigest"]}
