"""Frozen repair authorizations, candidate receipts, independent review and atomic publication."""

import hashlib
import json
import time

from .auditing import validate_result
from .auth import new_id, now
from .db import transaction
from .models import public_model_config
from .packages import VERSION, inspect_package, safe_path
from .registry import may_write, record_event, register_in_transaction, storage_lock
from .repair_packages import bump_version, changes, unpack
from .tasks import Conflict, RULE_VERSION, valid_attempt


def create_repair(
    root,
    user,
    audit_run_id,
    selected_ids,
    target_version,
    allowed_paths,
    max_rounds,
    publish_after_review,
    make_current,
    idempotency_key,
):
    if not VERSION.fullmatch(target_version) or not 1 <= max_rounds <= 3:
        raise ValueError("目标版本格式无效，或修复轮数超出 1–3")
    if not selected_ids or len(selected_ids) > 200 or len(selected_ids) != len(set(selected_ids)):
        raise ValueError("请选择 1–200 个明确问题，不得重复")
    if not idempotency_key or len(idempotency_key) > 128:
        raise ValueError("需要有效幂等键")
    if len(allowed_paths) > 500:
        raise ValueError("允许修改的文件过多")
    for path in allowed_paths:
        safe_path(path)
    config = public_model_config(root)
    with transaction(root, write=True) as db:
        source = db.execute(
            "SELECT a.*,v.skill_id,v.version,v.content_digest,a2.digest AS artifact_digest,s.owner_id,s.slug,s.current_version_id FROM audit_runs a JOIN versions v ON v.id=a.version_id JOIN artifacts a2 ON a2.id=v.artifact_id JOIN skills s ON s.id=v.skill_id WHERE a.id=?",
            (audit_run_id,),
        ).fetchone()
        if not source:
            raise ValueError("原审计不存在")
        if not may_write(user, source):
            raise PermissionError("只有维护者或管理员可授权修复")
        if source["delivery_status"] != "saved" or not source["result_json"]:
            raise Conflict("原审计报告尚未保存")
        if source["rule_version"] != RULE_VERSION:
            raise Conflict("原审计规则版本已变化，请重新审计后授权")
        report = json.loads(source["result_json"])
        if (
            report.get("reportDigest") != source["report_digest"]
            or report.get("contentDigest") != source["content_digest"]
            or report.get("versionId") != source["version_id"]
            or hashlib.sha256(report["reportMarkdown"].encode()).hexdigest() != source["report_digest"]
        ):
            raise Conflict("原审计身份或报告摘要不一致")
        by_id = {f["id"]: f for f in report["findings"]}
        if any(i not in by_id for i in selected_ids):
            raise ValueError("选择的问题不属于此固定审计")
        selected = [by_id[i] for i in sorted(selected_ids)]
        if any(f["reviewRequired"] for f in selected):
            raise Conflict("所选问题仍待复核，先确认问题后重新审计")
        if target_version == source["version"]:
            raise ValueError("目标版本必须区别于原版本")
        edit_paths = sorted(set(allowed_paths) | {f["file"] for f in selected})
        for path in edit_paths:
            safe_path(path)
        auth = {
            "sourceAuditRunId": audit_run_id,
            "sourceReportDigest": source["report_digest"],
            "sourceVersionId": source["version_id"],
            "sourceContentDigest": source["content_digest"],
            "selectedIds": sorted(selected_ids),
            "selectedFindings": selected,
            "editPaths": edit_paths,
            "allowedPaths": sorted(set(edit_paths) | {"SKILL.md"}),
            "targetVersion": target_version,
            "maxRounds": max_rounds,
            "publishAfterReview": publish_after_review,
            "makeCurrent": make_current,
            "independentReview": True,
        }
        previous = db.execute("SELECT * FROM tasks WHERE idempotency_key=?", (idempotency_key,)).fetchone()
        if previous:
            frozen = json.loads(previous["manifest_json"])
            if (
                previous["created_by"] != user["id"]
                or frozen.get("kind") != "repair"
                or frozen.get("authorization") != auth
            ):
                raise Conflict("幂等键已用于其他请求")
            return {"task_id": previous["id"], "repair_run_id": previous["repair_run_id"], "reused": True}
        if db.execute(
            "SELECT 1 FROM versions WHERE skill_id=? AND version=?", (source["skill_id"], target_version)
        ).fetchone():
            raise Conflict("目标版本已存在，请换一个版本号")
        baseline = db.execute(
            "SELECT id FROM versions WHERE skill_id=? ORDER BY rowid DESC LIMIT 1", (source["skill_id"],)
        ).fetchone()[0]
        task_id, repair_id, planned = new_id(), new_id(), new_id()
        manifest = {
            "schemaVersion": 1,
            "kind": "repair",
            "taskId": task_id,
            "auditRunId": repair_id,
            "repairRunId": repair_id,
            "skillId": source["skill_id"],
            "skillSlug": source["slug"],
            "versionId": source["version_id"],
            "plannedVersionId": planned,
            "registeredVersion": source["version"],
            "contentDigest": source["content_digest"],
            "artifactDigest": source["artifact_digest"],
            "depth": source["depth"],
            "mode": "full",
            "ruleVersion": RULE_VERSION,
            "modelRevision": config.get("revision"),
            "authorization": auth,
            "limits": {"durationSeconds": 900, "modelCalls": 96, "fileBytes": 262144},
        }
        db.execute(
            "INSERT INTO repair_runs(id,audit_run_id,authorized_by,authorization_json,created_at,target_version,planned_version_id,baseline_version_id,baseline_current_id,max_rounds) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                repair_id,
                audit_run_id,
                user["id"],
                json.dumps(auth, ensure_ascii=False),
                now(),
                target_version,
                planned,
                baseline,
                source["current_version_id"],
                max_rounds,
            ),
        )
        db.execute(
            "INSERT INTO tasks(id,version_id,kind,state,idempotency_key,manifest_json,created_by,created_at,repair_run_id,available_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                task_id,
                source["version_id"],
                "repair",
                "queued" if config.get("ready") else "waiting_configuration",
                idempotency_key,
                json.dumps(manifest, ensure_ascii=False),
                user["id"],
                now(),
                repair_id,
                int(time.time()),
            ),
        )
        db.execute("UPDATE repair_runs SET task_id=? WHERE id=?", (task_id, repair_id))
        record_event(
            db,
            user["id"],
            "repair.authorized",
            repair_id,
            {"task_id": task_id, "selected_ids": auth["selectedIds"], "target_version": target_version},
        )
        return {"task_id": task_id, "repair_run_id": repair_id, "reused": False}


def repair_manifest(db, worker_id, attempt_id, generation):
    attempt = valid_attempt(db, worker_id, attempt_id, generation)
    manifest = json.loads(attempt["manifest_json"])
    if manifest.get("kind") != "repair":
        raise PermissionError("此任务不是修复任务")
    repair = db.execute("SELECT * FROM repair_runs WHERE id=?", (manifest["repairRunId"],)).fetchone()
    if json.loads(repair["authorization_json"]) != manifest["authorization"]:
        raise Conflict("授权快照不一致")
    return attempt, manifest, repair


def progress(root, worker_id, attempt_id, generation):
    with transaction(root) as db:
        _, manifest, repair = repair_manifest(db, worker_id, attempt_id, generation)
        rows = [
            dict(r)
            for r in db.execute(
                "SELECT r.*,a.digest AS artifact_digest FROM repair_rounds r JOIN artifacts a ON a.id=r.artifact_id WHERE repair_run_id=? ORDER BY round_number",
                (repair["id"],),
            )
        ]
    for row in rows:
        row["diff"] = json.loads(row.pop("diff_json"))
        raw = row.pop("review_json")
        row["review"] = json.loads(raw) if raw else None
    return {"repair_run_id": manifest["repairRunId"], "rounds": rows}


def review_manifest(manifest, receipt, attempt_id=None, generation=None):
    return {
        **manifest,
        "kind": "audit",
        "taskId": manifest["taskId"],
        "auditRunId": receipt["id"],
        "versionId": manifest["plannedVersionId"],
        "registeredVersion": manifest["authorization"]["targetVersion"],
        "contentDigest": receipt["content_digest"],
        "artifactDigest": receipt["artifact_digest"],
        "attemptId": attempt_id or receipt["attempt_id"],
        "leaseGeneration": generation or receipt.get("generation", 1),
        "repairScope": {
            "repairRunId": manifest["repairRunId"],
            "selectedFindings": manifest["authorization"]["selectedFindings"],
            "allowedPaths": manifest["authorization"]["allowedPaths"],
            "diff": receipt["diff"],
        },
        "repairRound": receipt["round_number"],
    }


def accept_candidate(root, worker_id, attempt_id, generation, round_number, raw):
    package, after = unpack(raw)
    with storage_lock(root), transaction(root, write=True) as db:
        _, manifest, repair = repair_manifest(db, worker_id, attempt_id, generation)
        existing = db.execute(
            "SELECT r.*,a.digest AS artifact_digest FROM repair_rounds r JOIN artifacts a ON a.id=r.artifact_id WHERE repair_run_id=? AND round_number=?",
            (repair["id"], round_number),
        ).fetchone()
        if existing:
            if (
                existing["content_digest"] != package.content_digest
                or existing["artifact_digest"] != package.artifact_digest
            ):
                raise Conflict("同一轮候选已经冻结，不能覆盖")
            return {
                "id": existing["id"],
                "content_digest": package.content_digest,
                "artifact_digest": package.artifact_digest,
                "reused": True,
            }
        rounds = db.execute(
            "SELECT count(*) FROM repair_rounds WHERE repair_run_id=?", (repair["id"],)
        ).fetchone()[0]
        if round_number != rounds + 1 or round_number > repair["max_rounds"]:
            raise Conflict("修复轮数无效或预算已耗尽")
        if rounds:
            previous = db.execute(
                "SELECT review_json FROM repair_rounds WHERE repair_run_id=? AND round_number=?",
                (repair["id"], rounds),
            ).fetchone()[0]
            if not previous:
                raise Conflict("上一轮尚未完成独立复审")
        if (
            package.metadata.get("name") != manifest["skillSlug"]
            or package.metadata.get("version") != repair["target_version"]
        ):
            raise Conflict("候选名称或声明版本与授权不一致")
        _, before = unpack((root / "objects" / (manifest["artifactDigest"] + ".zip")).read_bytes())
        diff = changes(before, after)
        if any(c["path"] not in manifest["authorization"]["allowedPaths"] for c in diff):
            raise PermissionError("候选修改超出授权文件范围")
        if "SKILL.md" not in manifest["authorization"]["editPaths"] and after.get("SKILL.md") != bump_version(
            before["SKILL.md"], repair["target_version"]
        ):
            raise PermissionError("SKILL.md 只授权自动调整版本，不允许额外改写")
        artifact = db.execute(
            "SELECT id FROM artifacts WHERE digest=?", (package.artifact_digest,)
        ).fetchone()
        artifact_id = artifact[0] if artifact else new_id()
        if not artifact:
            path = root / "objects" / (package.artifact_digest + ".zip")
            temp = root / "tmp" / new_id()
            try:
                with temp.open("xb") as out:
                    temp.chmod(0o600)
                    out.write(raw)
                    out.flush()
                    import os

                    os.fsync(out.fileno())
                temp.replace(path)
            finally:
                temp.unlink(missing_ok=True)
            db.execute(
                "INSERT INTO artifacts VALUES (?,?,?,?,?)",
                (artifact_id, package.artifact_digest, len(raw), "application/zip", now()),
            )
        receipt = new_id()
        db.execute(
            "INSERT INTO repair_rounds(id,repair_run_id,round_number,attempt_id,artifact_id,content_digest,diff_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                receipt,
                repair["id"],
                round_number,
                attempt_id,
                artifact_id,
                package.content_digest,
                json.dumps(diff, ensure_ascii=False),
                now(),
            ),
        )
        db.execute(
            "UPDATE repair_runs SET state='reauditing',round=?,candidate_digest=? WHERE id=?",
            (round_number, package.content_digest, repair["id"]),
        )
        record_event(
            db,
            worker_id,
            "repair.candidate_frozen",
            repair["id"],
            {"round": round_number, "content_digest": package.content_digest},
        )
        return {
            "id": receipt,
            "content_digest": package.content_digest,
            "artifact_digest": package.artifact_digest,
            "reused": False,
        }


def save_review(root, worker_id, attempt_id, generation, round_number, result):
    with transaction(root, write=True) as db:
        _, manifest, repair = repair_manifest(db, worker_id, attempt_id, generation)
        row = db.execute(
            "SELECT r.*,a.digest AS artifact_digest FROM repair_rounds r JOIN artifacts a ON a.id=r.artifact_id WHERE repair_run_id=? AND round_number=?",
            (repair["id"], round_number),
        ).fetchone()
        if not row:
            raise ValueError("候选尚未保存")
        receipt = {**dict(row), "diff": json.loads(row["diff_json"])}
        expected = review_manifest(manifest, receipt, attempt_id, generation)
        checked = validate_result(result, expected)
        canonical = json.dumps(checked, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        if row["review_json"]:
            if row["review_digest"] != digest:
                raise Conflict("复审报告已经冻结，不能重新评分覆盖")
            return {"saved": True, "reused": True, "review_digest": digest}
        if repair["round"] != round_number:
            raise Conflict("只接受当前候选的独立复审")
        db.execute(
            "UPDATE repair_rounds SET review_json=?,review_digest=? WHERE id=?",
            (canonical, digest, row["id"]),
        )
        record_event(
            db,
            worker_id,
            "repair.review_saved",
            repair["id"],
            {"round": round_number, "verdict": checked["verdict"], "report_digest": checked["reportDigest"]},
        )
        return {"saved": True, "reused": False, "review_digest": digest}


def _gate(db, root, repair, manifest):
    row = db.execute(
        "SELECT r.*,a.digest AS artifact_digest FROM repair_rounds r JOIN artifacts a ON a.id=r.artifact_id WHERE repair_run_id=? AND round_number=?",
        (repair["id"], repair["round"]),
    ).fetchone()
    if not row or not row["review_json"]:
        raise Conflict("候选或复审报告尚未保存")
    result = json.loads(row["review_json"])
    expected = review_manifest(
        manifest,
        {**dict(row), "diff": json.loads(row["diff_json"])},
        result["attemptId"],
        result["leaseGeneration"],
    )
    validate_result(result, expected)
    if result["verdict"] != "pass" or result["reviewRequired"] or not result.get("scopeSatisfied"):
        raise Conflict("独立完整复审或授权范围检查未通过")
    if any(
        f["ruleId"] in {s["ruleId"] for s in manifest["authorization"]["selectedFindings"]}
        for f in result["findings"]
    ):
        raise Conflict("所选规则仍有未修复问题")
    package = inspect_package((root / "objects" / (row["artifact_digest"] + ".zip")).read_bytes())
    if (
        package.artifact_digest != row["artifact_digest"]
        or package.content_digest != row["content_digest"]
        or package.content_digest != repair["candidate_digest"]
    ):
        raise Conflict("复审后候选内容发生变化")
    skill = db.execute("SELECT * FROM skills WHERE id=?", (manifest["skillId"],)).fetchone()
    latest = db.execute(
        "SELECT id FROM versions WHERE skill_id=? ORDER BY rowid DESC LIMIT 1", (manifest["skillId"],)
    ).fetchone()[0]
    if (
        latest != repair["baseline_version_id"]
        or skill["current_version_id"] != repair["baseline_current_id"]
    ):
        raise Conflict("修复期间版本或当前指针已变化，请基于最新状态重新创建任务")
    actor = db.execute("SELECT id,role,active FROM users WHERE id=?", (repair["authorized_by"],)).fetchone()
    if not actor or not actor["active"] or not may_write(dict(actor), skill):
        raise PermissionError("原授权者权限已经失效")
    return row, result, package, dict(actor)


def _publish(db, root, repair, manifest):
    if repair["published_version_id"]:
        return {"version_id": repair["published_version_id"], "reused": True}
    task = db.execute("SELECT * FROM tasks WHERE id=?", (repair["task_id"],)).fetchone()
    if task["state"] != "succeeded" or task["cancel_requested"]:
        raise Conflict("只有成功完成且未取消的任务可以登记版本")
    row, result, package, actor = _gate(db, root, repair, manifest)
    registered = register_in_transaction(
        db,
        root,
        actor,
        package,
        manifest["skillSlug"],
        repair["target_version"],
        version_id=repair["planned_version_id"],
    )
    if registered["reused"]:
        raise Conflict("目标版本已被其他操作登记")
    version_id = repair["planned_version_id"]
    db.execute(
        "INSERT INTO audit_runs(id,version_id,depth,rule_version,verdict,delivery_status,report_digest,result_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (
            result["auditRunId"],
            version_id,
            result["depth"],
            result["ruleVersion"],
            result["verdict"],
            "saved",
            result["reportDigest"],
            row["review_json"],
            now(),
        ),
    )
    for finding in result["findings"]:
        db.execute(
            "INSERT INTO findings VALUES (?,?,?,?,?,?)",
            (
                result["auditRunId"] + ":" + finding["id"],
                result["auditRunId"],
                finding["ruleId"],
                finding["severity"],
                int(finding["reviewRequired"]),
                json.dumps(finding, ensure_ascii=False),
            ),
        )
    if manifest["authorization"]["makeCurrent"]:
        db.execute("UPDATE skills SET current_version_id=? WHERE id=?", (version_id, manifest["skillId"]))
    db.execute(
        "UPDATE repair_runs SET state='published',published_version_id=?,finished_at=? WHERE id=?",
        (version_id, now(), repair["id"]),
    )
    record_event(
        db,
        actor["id"],
        "repair.published",
        repair["id"],
        {"version_id": version_id, "report_digest": result["reportDigest"]},
    )
    return {"version_id": version_id, "reused": False}


def submit_repair_result(root, worker_id, attempt_id, generation, result):
    canonical = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    with storage_lock(root), transaction(root, write=True) as db:
        previous = db.execute("SELECT * FROM task_attempts WHERE id=?", (attempt_id,)).fetchone()
        if previous and previous["state"] == "succeeded":
            if (
                previous["worker_id"] != worker_id
                or previous["generation"] != generation
                or previous["result_digest"] != digest
            ):
                raise Conflict("已完成结果不可覆盖")
            return {"saved": True, "reused": True}
        attempt, manifest, repair = repair_manifest(db, worker_id, attempt_id, generation)
        for key in (
            "taskId",
            "auditRunId",
            "repairRunId",
            "versionId",
            "contentDigest",
            "artifactDigest",
            "attemptId",
            "leaseGeneration",
        ):
            expected = (
                attempt_id
                if key == "attemptId"
                else generation
                if key == "leaseGeneration"
                else manifest.get(key)
            )
            if result.get(key) != expected:
                raise Conflict("修复结果身份无效：" + key)
        state = result.get("state")
        if state not in {"ready", "needs_attention"}:
            raise ValueError("修复终态无效")
        if len(canonical) > 65536:
            raise ValueError("修复结果过大")
        code = result.get("reason", "")
        if not isinstance(code, str) or len(code) > 1000:
            raise ValueError("结果说明无效")
        if state == "ready":
            try:
                _gate(db, root, repair, manifest)
            except (Conflict, PermissionError) as exc:
                state = "needs_attention"
                code = "publication_gate_blocked: " + str(exc)
        db.execute(
            "UPDATE task_attempts SET state='succeeded',result_digest=?,updated_at=? WHERE id=?",
            (digest, now(), attempt_id),
        )
        db.execute("UPDATE tasks SET state='succeeded',finished_at=? WHERE id=?", (now(), attempt["task_id"]))
        db.execute(
            "UPDATE repair_runs SET state=?,failure_code=?,result_digest=?,finished_at=? WHERE id=?",
            (state, code or None, digest, now(), repair["id"]),
        )
        if state == "ready" and manifest["authorization"]["publishAfterReview"]:
            repair = db.execute("SELECT * FROM repair_runs WHERE id=?", (repair["id"],)).fetchone()
            _publish(db, root, repair, manifest)
        record_event(db, worker_id, "repair.finished", repair["id"], {"state": state, "reason": code})
    return {"saved": True, "reused": False}


def publish(root, user, repair_id):
    with storage_lock(root), transaction(root, write=True) as db:
        row = db.execute(
            "SELECT r.*,s.owner_id FROM repair_runs r JOIN audit_runs a ON a.id=r.audit_run_id JOIN versions v ON v.id=a.version_id JOIN skills s ON s.id=v.skill_id WHERE r.id=?",
            (repair_id,),
        ).fetchone()
        if not row:
            raise ValueError("修复记录不存在")
        if not may_write(user, row):
            raise PermissionError("无权登记此候选版本")
        task = db.execute("SELECT manifest_json FROM tasks WHERE id=?", (row["task_id"],)).fetchone()
        if row["state"] not in {"ready", "published"}:
            raise Conflict("候选尚未就绪")
        return _publish(db, root, row, json.loads(task["manifest_json"]))
