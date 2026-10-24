"""Fixed, licensed audit inputs and explicit oracles. Target code is data only."""

import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

from .packages import inspect_package, safe_path
from .privacy import TargetPrivacy


def fixed_package(files):
    """Stored ZIP avoids dependence on the host's zlib version."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, raw in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, raw)
    return buffer.getvalue()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load_corpus(path: Path):
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("schemaVersion") != 1 or not isinstance(document.get("cases"), list):
        raise ValueError("corpus_schema_invalid")
    seen, loaded = set(), []
    root = path.parent.resolve()
    for case in document["cases"]:
        identity = case.get("id", "")
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", identity) or identity in seen:
            raise ValueError("corpus_case_identity_invalid")
        seen.add(identity)
        if case.get("depth") not in {"L1", "L2"}:
            raise ValueError("corpus_depth_invalid")
        source = case["input"]
        files = {}
        if "directory" in source:
            relative = safe_path(source["directory"])
            target = root / relative
            if not target.resolve().is_relative_to(root) or any(
                p.is_symlink() for p in [target, *target.parents] if p.is_relative_to(root)
            ):
                raise ValueError("corpus_directory_invalid")
            for file in sorted(target.rglob("*")):
                if file.is_symlink():
                    raise ValueError("corpus_symlink_forbidden")
                if file.is_file():
                    files[file.relative_to(target).as_posix()] = file.read_bytes()
            if {name: digest(raw) for name, raw in files.items()} != source["fileDigests"]:
                raise ValueError("corpus_vendor_digest_mismatch")
        else:
            for name, value in source["files"].items():
                safe_path(name)
                if isinstance(value, dict):
                    count = value.get("repeat")
                    if (
                        type(count) is not int
                        or not 1 <= count <= 50000
                        or not isinstance(value.get("text"), str)
                    ):
                        raise ValueError("corpus_repeat_invalid")
                    if len(value["text"].encode()) * count > 4 * 1024 * 1024:
                        raise ValueError("corpus_file_too_large")
                    value = value["text"] * count
                if not isinstance(value, str):
                    raise ValueError("corpus_text_invalid")
                files[name] = value.encode()
        raw = fixed_package(files)
        package = inspect_package(raw)
        if (
            package.content_digest != case["contentDigest"]
            or package.artifact_digest != case["artifactDigest"]
        ):
            raise ValueError("corpus_input_digest_mismatch")
        for mode in ("static", "full"):
            expected = case["expected"][mode]
            if expected.get("manualReview"):
                continue
            if not expected.get("verdicts") or not set(expected["verdicts"]) <= {
                "pass",
                "fail",
                "review_required",
            }:
                raise ValueError("corpus_oracle_invalid")
        privacy = bool(TargetPrivacy(files).locations)
        if privacy != case["privacyBlocked"]:
            raise ValueError("corpus_privacy_expectation_changed")
        loaded.append({**case, "raw": raw, "files": files})
    if not loaded:
        raise ValueError("corpus_empty")
    return document, loaded


def assess(report, expected):
    """Count rule-level oracle disagreements separately from unresolved evidence."""
    if expected.get("manualReview"):
        return {
            "matched": None,
            "manualReview": True,
            "falsePositiveRuleIds": [],
            "falseNegativeRuleIds": [],
            "missingReviewRuleIds": [],
        }
    confirmed = {row["ruleId"] for row in report["findings"] if not row["reviewRequired"]}
    review = {row["ruleId"] for row in report["findings"] if row["reviewRequired"]}
    required = set(expected.get("confirmedRules", []))
    forbidden = set(expected.get("forbiddenRules", []))
    extra = confirmed - required if expected.get("strictConfirmed") else confirmed & forbidden
    missing = required - confirmed
    missing_review = set(expected.get("reviewRules", [])) - review
    missing_groups = [
        group for group in expected.get("anyConfirmedRules", []) if not confirmed.intersection(group)
    ]
    matched = (
        report["verdict"] in expected["verdicts"]
        and not (extra or missing or missing_review or missing_groups)
        and (
            expected.get("semanticCompleted") is None
            or report["semanticCompleted"] == expected["semanticCompleted"]
        )
    )
    return {
        "matched": matched,
        "manualReview": False,
        "falsePositiveRuleIds": sorted(extra),
        "falseNegativeRuleIds": sorted(missing),
        "missingReviewRuleIds": sorted(missing_review),
        "missingAnyConfirmedRules": missing_groups,
    }
