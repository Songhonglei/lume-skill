"""Bind human adjudication to an existing run without rewriting frozen evidence."""

import argparse
import json
from pathlib import Path

from .auditing import engine
from .privacy import redact
from .regression_corpus import digest


def adjudicate(run_bytes, review):
    run = json.loads(run_bytes)
    if (
        run.get("schemaVersion") != 1
        or review.get("schemaVersion") != 1
        or review.get("runDigest") != digest(run_bytes)
    ):
        raise ValueError("review_run_binding_invalid")
    reviewer = review.get("reviewer")
    if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 100:
        raise ValueError("reviewer_required")
    rows = review.get("reviews")
    if not isinstance(rows, list) or not rows or len(rows) > 1000:
        raise ValueError("review_rows_invalid")
    evidence = {(r["caseId"], r["repetition"]): r for r in run["cases"] if r.get("report")}
    seen, checked = set(), []
    for row in rows:
        key = (row.get("caseId"), row.get("repetition"))
        source = evidence.get(key)
        if key in seen or not source or row.get("reportDigest") != source["reportDigest"]:
            raise ValueError("review_case_binding_invalid")
        seen.add(key)
        rules = set(engine().catalogue(source["depth"]))
        confirmed = set(source["confirmedRules"])
        false_positive, false_negative = row.get("falsePositiveRules", []), row.get("falseNegativeRules", [])
        if any(
            not isinstance(items, list) or any(not isinstance(item, str) for item in items)
            for items in (false_positive, false_negative)
        ):
            raise ValueError("review_rule_ids_invalid")
        if not set(false_positive) <= confirmed or not set(false_negative) <= rules - confirmed:
            raise ValueError("review_rule_evidence_invalid")
        if row.get("decision") not in {"accepted", "rejected", "uncertain"} or (
            row["decision"] == "accepted" and (false_positive or false_negative)
        ):
            raise ValueError("review_decision_invalid")
        note = row.get("note")
        if not isinstance(note, str) or not note.strip() or len(note) > 2000:
            raise ValueError("review_note_required")
        checked.append(
            {
                "caseId": key[0],
                "repetition": key[1],
                "reportDigest": row["reportDigest"],
                "evidenceKind": source["evidenceKind"],
                "decision": row["decision"],
                "falsePositiveRules": sorted(set(false_positive)),
                "falseNegativeRules": sorted(set(false_negative)),
                "note": redact(note),
            }
        )
    return {
        "schemaVersion": 1,
        "evidenceKind": "human_review",
        "runDigest": review["runDigest"],
        "suiteDigest": run["suiteDigest"],
        "reviewer": redact(reviewer),
        "reviews": checked,
        "summary": {
            "reviewed": len(checked),
            "pending": len(evidence) - len(checked),
            "uncertain": sum(r["decision"] == "uncertain" for r in checked),
            "falsePositiveRuleCount": sum(len(r["falsePositiveRules"]) for r in checked),
            "falseNegativeRuleCount": sum(len(r["falseNegativeRules"]) for r in checked),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--reviews", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = adjudicate(args.run.read_bytes(), json.loads(args.reviews.read_text()))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x") as stream:
            args.output.chmod(0o600)
            json.dump(result, stream, ensure_ascii=False, indent=2)
    except (ValueError, OSError, KeyError, TypeError):
        print("Review invalid; use the exact run/report digests, explicit reviewer and a new output path.")
        return 2
    print(json.dumps(result["summary"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
