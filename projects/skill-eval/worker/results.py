"""Map real 0.14.0 reports without confusing execution status and evaluation verdict."""
from collections import Counter
from typing import Any


def summarize(raw: dict[str, Any] | None, frozen_ids: list[str], exit_code: int | None) -> dict:
    if not frozen_ids or len(set(frozen_ids)) != len(frozen_ids):
        raise ValueError("Frozen case list must be nonempty and unique")
    raw = raw if isinstance(raw, dict) else {}
    reports = raw.get("case_results", [])
    if not isinstance(reports, list):
        reports = []
    malformed = any(not isinstance(row, dict) or not isinstance(row.get("case_id"), str) for row in reports)
    counts = Counter(row["case_id"] for row in reports if isinstance(row, dict) and isinstance(row.get("case_id"), str))
    extras = [case_id for case_id in counts if case_id not in frozen_ids]
    cases = []
    for case_id in frozen_ids:
        matches = [row for row in reports if isinstance(row, dict) and row.get("case_id") == case_id]
        status, reason = "INCOMPLETE", "没有案例结果"
        row = matches[0] if len(matches) == 1 else {}
        if len(matches) > 1:
            reason = "同一案例包含重复结果"
        elif row:
            grade = row.get("grading") if isinstance(row.get("grading"), dict) else {}
            assertions = grade.get("assertion_results") if isinstance(grade.get("assertion_results"), list) else []
            if row.get("status") in {"PASS", "FAIL"} and grade.get("status") in {"PASS", "FAIL"}:
                if assertions and all(isinstance(a, dict) and isinstance(a.get("passed"), bool) for a in assertions):
                    all_passed = all(a["passed"] for a in assertions)
                    if row["status"] == grade["status"] == ("PASS" if all_passed else "FAIL"):
                        status = "PASSED" if all_passed else "FAILED"
                        reason = "判分完成"
                    else:
                        reason = "案例状态与断言结果不一致"
                else:
                    reason = "缺少有效判分断言"
            else:
                reason = row.get("error") or row.get("reason") or f"案例未完成：{row.get('status', 'unknown')}"
        cases.append({"case_id": case_id, "verdict": status, "reason": reason, "raw": row})
    incomplete = any(row["verdict"] == "INCOMPLETE" for row in cases) or bool(extras) or malformed
    # A nonzero CLI exit is expected for assertion failures, but not for an all-PASS report.
    if exit_code not in (0, 1) or (exit_code == 1 and all(c["verdict"] == "PASSED" for c in cases)):
        incomplete = True
    verdict = ("INCOMPLETE" if incomplete else
               "FAILED" if any(c["verdict"] == "FAILED" for c in cases) else "PASSED")
    observed = raw.get("observed_configuration") if isinstance(raw.get("observed_configuration"), dict) else {}
    return {"execution_state": "FAILED" if incomplete else "SUCCEEDED", "verdict": verdict,
            "expected": len(frozen_ids), "passed": sum(c["verdict"] == "PASSED" for c in cases),
            "failed": sum(c["verdict"] == "FAILED" for c in cases), "cases": cases,
            "unexpected_cases": extras, "exit_code": exit_code,
            "requested_configuration": (raw or {}).get("requested_configuration"),
            "observed_configuration": observed,
            "actual_model": observed.get("model"),
            "usage": {key: (raw or {}).get(key) for key in ("total_tokens", "judge_tokens", "overall_tokens")}}
