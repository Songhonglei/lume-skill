"""Batch audit/repair acceptance in a disposable real Web + worker instance.

Static mode never configures a model. Full mode is explicit, budgeted, and uses
the normal HTTP APIs and server gates; it never supplies fabricated model output.
"""

import argparse
import contextlib
import http.cookiejar
import json
import os
import platform
import secrets
import socket
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .auditing import engine
from .config import write_secret_json
from .packages import inspect_package
from .regression_corpus import assess, digest, load_corpus


class RegressionError(RuntimeError):
    pass


def read_model_config(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 16384:
        raise ValueError("model_config_requires_private_regular_file")
    config = json.loads(path.read_text())
    if not isinstance(config, dict) or not config.get("base_url") or not config.get("model"):
        raise ValueError("model_config_invalid")
    return {key: config.get(key, "") for key in ("base_url", "model", "api_key")}


class Budget:
    def __init__(self, limit):
        self.limit, self.used = limit, 0

    def allows(self, maximum):
        return self.used + maximum <= self.limit

    def charge(self, calls):
        if type(calls) is not int or calls < 0 or not self.allows(calls):
            raise RegressionError("model_budget_accounting_failed")
        self.used += calls


class LocalPlatform:
    def __init__(self, workspace):
        self.workspace, self.data = workspace, workspace / "data"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.origin = f"http://127.0.0.1:{self.port}"
        self.csrf = ""

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args):
                return None

        self.client = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            urllib.request.ProxyHandler({}),
            NoRedirect(),
        )

    def cli(self, *args):
        env = {**os.environ}
        # This instance must not inherit another deployment's binding or worker link.
        for key in ("SKILL_MNG_PUBLIC_URL", "SKILL_MNG_WORKER_CREDENTIALS", "SKILL_MNG_DATA", "PYTHONPATH"):
            env.pop(key, None)
        result = subprocess.run(
            [sys.executable, "-m", "skill_mng.cli", "--data-dir", str(self.data), *args],
            cwd=self.workspace,
            env=env,
            capture_output=True,
            text=True,
            timeout=45,
        )
        if result.returncode:
            raise RegressionError("local_cli_failed")
        return json.loads(result.stdout)

    def start(self):
        password = secrets.token_urlsafe(24)
        path = self.workspace / "password"
        path.write_text(password)
        path.chmod(0o600)
        self.cli("setup", "--username", "regression", "--password-file", str(path), "--port", str(self.port))
        self.cli("start")
        self.csrf = self.api("/login", {"username": "regression", "password": password})["csrf"]

    def stop(self):
        self.cli("stop")

    def api(self, path, body=None, *, raw=None, headers=None, binary=False, method=None):
        payload = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            self.origin + "/api" + path,
            data=payload,
            method=method,
            headers={"Content-Type": "application/json", "X-CSRF-Token": self.csrf, **(headers or {})},
        )
        try:
            with self.client.open(request, timeout=110 if path == "/model/probe" else 15) as response:
                content = response.read(32 * 1024 * 1024 + 1)
                if len(content) > 32 * 1024 * 1024:
                    raise RegressionError("api_response_too_large")
                return content if binary else json.loads(content)
        except urllib.error.HTTPError as exc:
            raise RegressionError("api_http_" + str(exc.code)) from None
        except (OSError, urllib.error.URLError):
            raise RegressionError("api_network_failed") from None

    def upload(self, case):
        boundary = secrets.token_hex(12)
        fields = {"name": case["slug"], "version": case["registeredVersion"]}
        body = b"".join(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
            for key, value in fields.items()
        )
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="case.zip"\r\nContent-Type: application/zip\r\n\r\n'.encode()
            + case["raw"]
            + f"\r\n--{boundary}--\r\n".encode()
        )
        return self.api(
            "/import/upload", raw=body, headers={"Content-Type": "multipart/form-data; boundary=" + boundary}
        )

    def await_task(self, identity, timeout):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            task = self.api("/tasks/" + identity)
            if task["state"] in {"succeeded", "failed", "cancelled"}:
                return task
            time.sleep(0.25)
        self.api("/tasks/" + identity + "/cancel", {})
        raise RegressionError("task_deadline_cancelled")


@contextlib.contextmanager
def isolated_platform():
    with tempfile.TemporaryDirectory(prefix="skill-mng-regression-") as directory:
        service = LocalPlatform(Path(directory))
        try:
            service.start()
            yield service
        finally:
            service.stop()


def verify_report(report):
    if not report or digest(report["reportMarkdown"].encode()) != report["reportDigest"]:
        raise RegressionError("report_digest_mismatch")


def repair_case(service, case, registered, audit_id, report, budget, cohort):
    contract = case["repair"]
    if not budget.allows(96):
        return {"status": "skipped_budget", "modelCalls": 0}
    rules = set(contract["selectedRules"])
    selected = [f["id"] for f in report["findings"] if f["ruleId"] in rules and not f["reviewRequired"]]
    present = {f["ruleId"] for f in report["findings"] if f["id"] in selected}
    if present != rules:
        return {"status": "missing_selected_findings", "modelCalls": 0}
    task = service.api(
        "/repairs",
        {
            "audit_run_id": audit_id,
            "selected_ids": selected,
            "target_version": contract["targetVersion"],
            "allowed_paths": [],
            "max_rounds": contract["maxRounds"],
            "publish_after_review": True,
            "make_current": False,
            "idempotency_key": cohort + "-repair",
        },
    )
    started = time.monotonic()
    finished = service.await_task(task["task_id"], 3700)
    budget.charge(finished["model_calls"])
    detail = service.api("/repairs/" + task["repair_run_id"])
    record = {
        "status": detail["state"],
        "taskState": finished["state"],
        "failureCode": detail["failure_code"],
        "rounds": detail["round"],
        "modelCalls": finished["model_calls"],
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    if detail["state"] != "published":
        return record
    receipt = detail["rounds"][-1]
    review = receipt["review"]
    verify_report(review)
    candidate = service.api("/versions/" + detail["published_version_id"] + "/download", binary=True)
    package = inspect_package(candidate)
    downloaded_report = service.api("/repairs/" + task["repair_run_id"] + "/report", binary=True)
    skill = service.api("/skills/" + registered["skill_id"])
    preserved = service.api("/versions/" + registered["version_id"] + "/download", binary=True) == case["raw"]
    if not (
        review["verdict"] == "pass"
        and review["semanticCompleted"]
        and not review["reviewRequired"]
        and review["scopeSatisfied"]
        and preserved
        and review["versionId"] == detail["published_version_id"]
        and package.artifact_digest == receipt["artifact_digest"]
        and package.content_digest == receipt["content_digest"]
        and package.metadata.get("version") == contract["targetVersion"]
        and digest(downloaded_report) == review["reportDigest"]
        and skill["current_version_id"] == registered["version_id"]
        and service.api("/repairs/" + task["repair_run_id"] + "/publish", {})["reused"]
    ):
        raise RegressionError("repair_publication_invariant_failed")
    record.update(
        status="passed",
        artifactDigest=package.artifact_digest,
        contentDigest=package.content_digest,
        reportDigest=review["reportDigest"],
        sourcePreserved=True,
        currentPreserved=True,
        review=review,
        diff=receipt["diff"],
    )
    return record


def run_case(service, case, mode, budget, with_repair, repetition):
    maximum = 0 if mode == "static" or case["privacyBlocked"] else 16
    base = {
        "caseId": case["id"],
        "repetition": repetition,
        "inputContentDigest": case["contentDigest"],
        "inputArtifactDigest": case["artifactDigest"],
        "depth": case["depth"],
        "sourceKind": case["sourceKind"],
    }
    if not budget.allows(maximum):
        return {**base, "status": "skipped_budget", "modelCalls": 0}
    started = time.monotonic()
    registered = service.upload(case)
    cohort = secrets.token_hex(12)
    task = service.api(
        "/audits",
        {
            "version_id": registered["version_id"],
            "mode": mode,
            "depth": case["depth"],
            "idempotency_key": cohort,
        },
    )
    finished = service.await_task(task["task_id"], 1020)
    budget.charge(finished["model_calls"])
    base.update(
        modelCalls=finished["model_calls"],
        evidenceKind="real_model" if finished["model_calls"] else "static_only",
        taskState=finished["state"],
        elapsedSeconds=round(time.monotonic() - started, 3),
    )
    if finished["state"] != "succeeded":
        return {**base, "status": "execution_failed", "failureCode": finished["failure_code"]}
    report = service.api("/audits/" + task["audit_run_id"])["result"]
    verify_report(report)
    if service.api("/versions/" + registered["version_id"] + "/download", binary=True) != case["raw"]:
        raise RegressionError("original_changed")
    if report["contentDigest"] != case["contentDigest"] or report["artifactDigest"] != case["artifactDigest"]:
        raise RegressionError("audit_input_identity_mismatch")
    if (mode == "static" or case["privacyBlocked"]) and finished["model_calls"]:
        raise RegressionError("unexpected_model_call")
    assessment = assess(report, case["expected"][mode])
    base.update(
        status="manual_review"
        if assessment["manualReview"]
        else "passed"
        if assessment["matched"]
        else "oracle_mismatch",
        assessment=assessment,
        verdict=report["verdict"],
        semanticCompleted=report["semanticCompleted"],
        reviewRequired=report["reviewRequired"],
        score=report["score"],
        maxScore=report["maxScore"],
        confirmedRules=sorted({f["ruleId"] for f in report["findings"] if not f["reviewRequired"]}),
        reviewRules=sorted({f["ruleId"] for f in report["findings"] if f["reviewRequired"]}),
        reportDigest=report["reportDigest"],
        report=report,
    )
    if with_repair and case.get("repair"):
        base["repair"] = repair_case(service, case, registered, task["audit_run_id"], report, budget, cohort)
    return base


def summarize(rows, budget):
    counts = {
        key: sum(row["status"] == key for row in rows)
        for key in ("passed", "manual_review", "oracle_mismatch", "execution_failed", "skipped_budget")
    }
    repairs = [row["repair"] for row in rows if "repair" in row]
    assessments = [row["assessment"] for row in rows if "assessment" in row]
    return {
        **counts,
        "total": len(rows),
        "modelCallsIncludingProbeUpperBound": budget.used,
        "falsePositiveRuleCount": sum(len(r["falsePositiveRuleIds"]) for r in assessments),
        "falseNegativeRuleCount": sum(
            len(r["falseNegativeRuleIds"]) + len(r.get("missingAnyConfirmedRules", [])) for r in assessments
        ),
        "repairRequested": len(repairs),
        "repairPassed": sum(r["status"] == "passed" for r in repairs),
        "repairAttentionOrFailure": sum(r["status"] not in {"passed", "skipped_budget"} for r in repairs),
        "repairSkippedBudget": sum(r["status"] == "skipped_budget" for r in repairs),
    }


def run(
    corpus_path,
    output,
    *,
    mode="static",
    model_config=None,
    max_model_calls=0,
    cases=(),
    repeat=1,
    with_repair=False,
):
    document, loaded = load_corpus(corpus_path)
    selected = [case for case in loaded if not cases or case["id"] in cases]
    if not selected or set(cases) - {case["id"] for case in selected}:
        raise ValueError("unknown_or_empty_case_selection")
    if mode not in {"static", "full"} or not 1 <= repeat <= 10:
        raise ValueError("regression_options_invalid")
    if mode == "static" and (model_config or with_repair or max_model_calls):
        raise ValueError("static_mode_must_not_use_model_or_repair")
    if mode == "full" and (model_config is None or max_model_calls < 2):
        raise ValueError("full_mode_requires_private_config_and_explicit_budget")
    config = read_model_config(model_config) if mode == "full" else None
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x"):
        output.chmod(0o600)
    budget = Budget(max_model_calls)
    result = {
        "schemaVersion": 1,
        "suiteId": document["id"],
        "suiteDigest": digest(corpus_path.read_bytes()),
        "platformVersion": __version__,
        "ruleVersion": engine().RULE_VERSION,
        "pythonVersion": platform.python_version(),
        "system": platform.system(),
        "machine": platform.machine(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "evidenceKind": "model_run_requested" if mode == "full" else "static_only",
        "humanReview": "pending" if mode == "full" else "not_semantic_evidence",
        "maxModelCalls": max_model_calls,
        "status": "running",
        "cases": [],
    }
    if config:
        result["modelConfigFingerprint"] = digest(
            json.dumps({k: config[k] for k in ("base_url", "model")}, sort_keys=True).encode()
        )
    write_secret_json(output, result)
    try:
        # Each repetition starts with an empty registry so fixed repair versions
        # do not collide with a previous repetition's successful publication.
        for repetition in range(1, repeat + 1):
            if config and not budget.allows(2):
                result["cases"].extend(
                    {
                        "caseId": case["id"],
                        "repetition": repetition,
                        "status": "skipped_budget",
                        "modelCalls": 0,
                    }
                    for case in selected
                )
                continue
            with isolated_platform() as service:
                if config:
                    service.api("/model", config, method="PUT")
                    budget.charge(
                        2
                    )  # Capability detection issues at most two requests, even on early failure.
                    if not service.api("/model/probe", {})["ready"]:
                        raise RegressionError("model_probe_failed")
                for case in selected:
                    try:
                        row = run_case(service, case, mode, budget, with_repair, repetition)
                    except RegressionError as exc:
                        row = {
                            "caseId": case["id"],
                            "repetition": repetition,
                            "status": "execution_failed",
                            "failureCode": str(exc),
                        }
                        # A missing terminal response makes actual spend uncertain. Never start another model task.
                        result["cases"].append(row)
                        result["status"] = "interrupted"
                        result["modelSpendUncertain"] = mode == "full"
                        raise
                    result["cases"].append(row)
                    result["summary"] = summarize(result["cases"], budget)
                    write_secret_json(output, result)
                    print(json.dumps({"caseId": case["id"], "status": row["status"]}), flush=True)
        result["status"] = "completed"
    except KeyboardInterrupt:
        result["status"] = "interrupted"
        result["failureCode"] = "user_interrupted"
        result["modelSpendUncertain"] = mode == "full"
    except Exception as exc:
        result["status"] = "interrupted"
        result["failureCode"] = str(exc) if isinstance(exc, RegressionError) else "regression_internal_error"
    finally:
        if mode == "full":
            result["evidenceKind"] = (
                "incomplete_model_run"
                if result.get("modelSpendUncertain")
                else "real_model"
                if any(row.get("modelCalls", 0) for row in result["cases"])
                else "capability_only"
                if budget.used
                else "not_run"
            )
        result["summary"] = summarize(result["cases"], budget)
        write_secret_json(output, result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=Path("regression/corpus.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=["static", "full"], default="static")
    parser.add_argument("--model-config", type=Path)
    parser.add_argument("--max-model-calls", type=int, default=0)
    parser.add_argument("--case", action="append", default=[])
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--with-repair", action="store_true")
    args = parser.parse_args()
    try:
        result = run(
            args.corpus,
            args.output,
            mode=args.mode,
            model_config=args.model_config,
            max_model_calls=args.max_model_calls,
            cases=args.case,
            repeat=args.repeat,
            with_repair=args.with_repair,
        )
    except (ValueError, OSError, KeyError, TypeError):
        print(
            "Regression input invalid; check corpus, private config, budget and a new output path.",
            file=sys.stderr,
        )
        return 2
    print(json.dumps({"status": result["status"], "summary": result["summary"]}))
    summary = result["summary"]
    return (
        0
        if result["status"] == "completed"
        and not any(
            summary[key]
            for key in (
                "execution_failed",
                "oracle_mismatch",
                "skipped_budget",
                "repairAttentionOrFailure",
                "repairSkippedBudget",
            )
        )
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
