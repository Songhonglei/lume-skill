"""Offline contracts and real static HTTP/worker checks; no live model evidence."""

import contextlib
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from skill_mng.regression import (
    Budget,
    LocalPlatform,
    RegressionError,
    read_model_config,
    repair_case,
    run,
    run_case,
)
from skill_mng.regression_corpus import assess, digest, load_corpus
from skill_mng.regression_review import adjudicate

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "regression/corpus.json"


def test_corpus_has_fixed_inputs_and_unchanged_licensed_source():
    _, cases = load_corpus(CORPUS)
    assert len(cases) == 14
    assert {c["depth"] for c in cases} == {"L1", "L2"}
    assert sum(bool(c.get("repair")) for c in cases) == 2
    metadata = json.loads((ROOT / "regression/vendor/WEBAPP-TESTING-SOURCE.json").read_text())
    upstream = next(c for c in cases if c["sourceKind"] == "licensed_upstream")
    assert set(upstream["files"]) == set(metadata["files"])
    assert upstream["expected"]["full"]["manualReview"]
    for path, original in metadata["files"].items():
        raw = upstream["files"][path]
        assert digest(raw) == original["sha256"]
        assert (
            hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
            == original["git_blob_sha"]
        )


def test_changed_inline_or_vendor_input_cannot_silently_refresh_oracle(tmp_path):
    document = json.loads(CORPUS.read_text())
    document["cases"] = document["cases"][:1]
    document["cases"][0]["input"]["files"]["SKILL.md"] += "changed"
    path = tmp_path / "corpus.json"
    path.write_text(json.dumps(document))
    with pytest.raises(ValueError, match="corpus_input_digest_mismatch"):
        load_corpus(path)
    document["cases"][0]["input"] = {"directory": "../outside", "fileDigests": {}}
    path.write_text(json.dumps(document))
    with pytest.raises(ValueError):
        load_corpus(path)


def test_rule_oracle_counts_false_positives_and_keeps_review_separate():
    report = {
        "verdict": "fail",
        "semanticCompleted": True,
        "findings": [
            {"ruleId": "D6-E2", "reviewRequired": False},
            {"ruleId": "D3-E5", "reviewRequired": True},
        ],
    }
    matched = assess(
        report, {"verdicts": ["fail"], "anyConfirmedRules": [["D6-E2", "D6-E4"]], "reviewRules": ["D3-E5"]}
    )
    assert matched["matched"]
    wrong = assess(report, {"verdicts": ["pass"], "strictConfirmed": True, "confirmedRules": ["D6-E1"]})
    assert wrong["falsePositiveRuleIds"] == ["D6-E2"]
    assert wrong["falseNegativeRuleIds"] == ["D6-E1"]
    assert "D3-E5" not in wrong["falsePositiveRuleIds"]
    assert not assess(report, {"verdicts": ["fail"], "anyConfirmedRules": [["D6-E1"]]})["matched"]
    assert assess(report, {"manualReview": True})["matched"] is None


def test_budget_reserves_whole_task_before_any_api_call():
    class NoAPI:
        def api(self, *args, **kwargs):
            pytest.fail("Budget refusal must precede network or task creation")

    _, cases = load_corpus(CORPUS)
    case = next(c for c in cases if c.get("repair"))
    assert run_case(NoAPI(), case, "full", Budget(15), False, 1)["status"] == "skipped_budget"
    assert repair_case(NoAPI(), case, {}, "id", {}, Budget(95), "id")["status"] == "skipped_budget"
    budget = Budget(128)
    budget.charge(2)
    budget.charge(16)
    assert budget.allows(96)
    budget.charge(96)
    assert not budget.allows(16)
    with pytest.raises(RegressionError, match="budget"):
        budget.charge(15)


@pytest.mark.parametrize("kind", ["public", "symlink", "malformed"])
def test_config_requires_private_regular_json_file(tmp_path, kind):
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps({"base_url": "http://127.0.0.1:1/v1", "model": "fixture", "api_key": "synthetic-key"})
    )
    path.chmod(0o600)
    if kind == "public":
        path.chmod(0o644)
    elif kind == "symlink":
        target = path
        path = tmp_path / "link.json"
        path.symlink_to(target)
    else:
        path.write_text("{}")
    with pytest.raises(ValueError):
        read_model_config(path)


def test_static_options_never_accept_provider_config(tmp_path):
    with pytest.raises(ValueError, match="static_mode"):
        run(CORPUS, tmp_path / "result.json", model_config=tmp_path / "missing-config")
    with pytest.raises(ValueError, match="explicit_budget"):
        run(CORPUS, tmp_path / "result.json", mode="full", max_model_calls=256)
    assert not (tmp_path / "result.json").exists()


def test_child_cli_does_not_inherit_an_existing_instance_binding(tmp_path, monkeypatch):
    for key in ("SKILL_MNG_PUBLIC_URL", "SKILL_MNG_WORKER_CREDENTIALS", "SKILL_MNG_DATA", "PYTHONPATH"):
        monkeypatch.setenv(key, "synthetic-existing-instance")

    def process(command, **kwargs):
        assert command[1:3] == ["-m", "skill_mng.cli"]
        assert str(tmp_path / "data") in command
        assert not any(
            k in kwargs["env"]
            for k in ("SKILL_MNG_PUBLIC_URL", "SKILL_MNG_WORKER_CREDENTIALS", "SKILL_MNG_DATA", "PYTHONPATH")
        )
        return SimpleNamespace(returncode=0, stdout="{}")

    monkeypatch.setattr("skill_mng.regression.subprocess.run", process)
    assert LocalPlatform(tmp_path).cli("status") == {}


def test_error_preserves_partial_receipt_and_stops_next_case(tmp_path, monkeypatch):
    stops = []

    @contextlib.contextmanager
    def platform():
        try:
            yield object()
        finally:
            stops.append(True)

    def fail(*args):
        raise RegressionError("task_deadline_cancelled")

    monkeypatch.setattr("skill_mng.regression.isolated_platform", platform)
    monkeypatch.setattr("skill_mng.regression.run_case", fail)
    output = tmp_path / "receipt.json"
    result = run(CORPUS, output)
    assert result["status"] == "interrupted" and len(result["cases"]) == 1 and stops == [True]
    assert json.loads(output.read_text()) == result
    assert output.stat().st_mode & 0o077 == 0
    with pytest.raises(FileExistsError):
        run(CORPUS, output)


def test_failed_capability_preserves_stable_reason_and_model_without_secret(tmp_path, monkeypatch):
    @contextlib.contextmanager
    def platform():
        class Fixture:
            def api(self, path, body, **kwargs):
                if path == "/model/probe":
                    return {"ready": False, "failure_code": "model_http_403"}
                assert path == "/model" and kwargs["method"] == "PUT"

        yield Fixture()

    config = tmp_path / "private.json"
    config.write_text(
        json.dumps(
            {
                "base_url": "https://provider.example/v1",
                "model": "synthetic-fixture",
                "api_key": "synthetic-private-key",
            }
        )
    )
    config.chmod(0o600)
    monkeypatch.setattr("skill_mng.regression.isolated_platform", platform)
    result = run(CORPUS, tmp_path / "result.json", mode="full", model_config=config, max_model_calls=16)
    assert result["status"] == "interrupted" and not result["cases"]
    assert result["capabilityProbe"] == {"ready": False, "failureCode": "model_http_403"}
    assert result["modelId"] == "synthetic-fixture"
    assert result["summary"]["modelCallsIncludingProbeUpperBound"] == 2
    assert "synthetic-private-key" not in json.dumps(result)
    assert "provider.example" not in json.dumps(result)


def test_real_static_web_worker_cases_and_repeat_isolation(tmp_path):
    # Actual CLI processes/HTTP/worker; model service is never configured.
    result = run(
        CORPUS,
        tmp_path / "static.json",
        cases=["valid-multifile-l1", "syntax-error", "short-credential-block"],
        repeat=2,
    )
    assert result["status"] == "completed" and result["summary"]["passed"] == 6
    assert (
        result["evidenceKind"] == "static_only"
        and result["summary"]["modelCallsIncludingProbeUpperBound"] == 0
    )
    assert all(
        not row["semanticCompleted"] and row["evidenceKind"] == "static_only" for row in result["cases"]
    )
    assert "demo1234" not in json.dumps(result)
    assert result["cases"][0]["report"]["versionId"] != result["cases"][3]["report"]["versionId"]
    assert result["cases"][0]["inputContentDigest"] == result["cases"][3]["inputContentDigest"]


def test_human_review_binds_exact_run_and_report_without_rewriting():
    # Schema fixture only, not a real model acceptance result.
    source = {
        "schemaVersion": 1,
        "suiteDigest": "suite",
        "cases": [
            {
                "caseId": "case",
                "repetition": 1,
                "depth": "L1",
                "evidenceKind": "static_only",
                "confirmedRules": ["D4-E3"],
                "reportDigest": "report",
                "report": {"placeholder": "protocol_fixture"},
            }
        ],
    }
    raw = json.dumps(source).encode()
    review = {
        "schemaVersion": 1,
        "runDigest": digest(raw),
        "reviewer": "Synthetic test reviewer",
        "reviews": [
            {
                "caseId": "case",
                "repetition": 1,
                "reportDigest": "report",
                "decision": "rejected",
                "falsePositiveRules": ["D4-E3"],
                "falseNegativeRules": ["D6-E1"],
                "note": 'Fixture explanation. password="synthetic-secret"',
            }
        ],
    }
    result = adjudicate(raw, review)
    assert result["summary"] == {
        "reviewed": 1,
        "pending": 0,
        "uncertain": 0,
        "falsePositiveRuleCount": 1,
        "falseNegativeRuleCount": 1,
    }
    assert "synthetic-secret" not in json.dumps(result)
    assert json.loads(raw) == source
    review["reviewerKind"] = "agent"
    assert adjudicate(raw, review)["evidenceKind"] == "agent_review"
    review["reviewerKind"] = "invalid"
    with pytest.raises(ValueError, match="reviewer_kind"):
        adjudicate(raw, review)
    review["reviewerKind"] = "human"
    review["reviews"][0]["reportDigest"] = "another-report"
    with pytest.raises(ValueError, match="binding"):
        adjudicate(raw, review)


def test_private_config_retains_validated_effort(tmp_path):
    config = tmp_path / "model.json"
    data = {
        "base_url": "https://provider.example/v1",
        "model": "fixture",
        "api_key": "synthetic-key",
        "reasoning_effort": "low",
    }
    config.write_text(json.dumps(data))
    config.chmod(0o600)
    assert read_model_config(config)["reasoning_effort"] == "low"
    data["reasoning_effort"] = "arbitrary"
    config.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="reasoning_effort_invalid"):
        read_model_config(config)


def test_failed_repair_keeps_frozen_review_and_candidate_identity():
    _, cases = load_corpus(CORPUS)
    case = next(c for c in cases if c.get("repair"))
    rules = case["repair"]["selectedRules"]
    review = {
        "reportMarkdown": "Frozen incomplete review",
        "reportDigest": digest(b"Frozen incomplete review"),
        "semanticCompleted": False,
    }

    class Fixture:
        def api(self, path, body=None):
            if path == "/repairs":
                return {"task_id": "task", "repair_run_id": "repair"}
            assert path == "/repairs/repair"
            return {
                "state": "needs_attention",
                "failure_code": "independent_review_requires_attention",
                "round": 1,
                "rounds": [
                    {
                        "round_number": 1,
                        "artifact_digest": "artifact",
                        "content_digest": "content",
                        "review": review,
                        "diff": [],
                    }
                ],
            }

        def await_task(self, identity, timeout):
            return {"state": "succeeded", "model_calls": 4}

    budget = Budget(128)
    report = {"findings": [{"id": rule, "ruleId": rule, "reviewRequired": False} for rule in rules]}
    record = repair_case(Fixture(), case, {}, "audit", report, budget, "cohort")
    assert record["status"] == "needs_attention" and budget.used == 4
    assert record["roundReceipts"][0]["review"] == review
    assert record["roundReceipts"][0]["artifactDigest"] == "artifact"
