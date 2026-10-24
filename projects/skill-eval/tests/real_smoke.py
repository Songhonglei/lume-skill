"""Opt-in real model checks. Run one scenario deliberately; never included in pytest."""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

import yaml

from worker.engine import assemble_eval, check_versions, evaluate, isolated_environment
from worker.results import summarize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenario", choices=["three-judges", "generated-good", "generated-bad",
                                             "wrong-model", "missing-login", "timeout"])
    parser.add_argument("--model", required=True)
    parser.add_argument("--codex-home", type=Path, required=True)
    parser.add_argument("--suite", type=Path)
    parser.add_argument("--skill-up", type=Path, default=Path(".local/bin/skill-up"))
    options = parser.parse_args()
    root = Path(tempfile.mkdtemp(prefix="open-skill-eval-verify-"))
    record = Path(".local") / f"verify-{options.scenario}-path"
    record.parent.mkdir(exist_ok=True)
    record.write_text(str(root))
    model = "model-does-not-exist-open-skill-eval" if options.scenario == "wrong-model" else options.model
    env = isolated_environment(root / "home", options.codex_home, model)
    env["PATH"] = str(Path(".venv/bin").resolve()) + ":" + env["PATH"]
    versions = check_versions(options.skill_up.resolve(), env)
    if options.scenario == "missing-login":
        (root / "home/.codex/auth.json").unlink(missing_ok=True)
    source = root / "source"
    shutil.copytree("examples/label-text", source)
    if options.scenario == "generated-bad":
        skill = source / "SKILL.md"
        skill.write_text(skill.read_text().replace("LABEL: ", "BROKEN: "))
    suite = options.suite or source
    frozen = assemble_eval(source, suite, root / "assembled", model)
    if options.scenario in {"wrong-model", "missing-login", "timeout"}:
        entry = root / "assembled/evals/eval.yaml"
        config = yaml.safe_load(entry.read_text())
        config["cases"]["files"] = [config["cases"]["files"][0]]
        config["cases"]["defaults"]["timeout_seconds"] = 30
        if options.scenario == "timeout":
            config["cases"]["defaults"]["timeout_seconds"] = 1
        entry.write_text(yaml.safe_dump(config, allow_unicode=True))
        frozen = frozen[:1]
    print("Starting", options.scenario, "with", len(frozen), "frozen cases", flush=True)
    code = evaluate(options.skill_up.resolve(), root / "assembled", root / "report", env, 1800)
    files = list((root / "report").rglob("result.json"))
    raw = json.loads(files[0].read_text()) if len(files) == 1 else None
    result = summarize(raw, frozen, code)
    public = {"scenario": options.scenario, "versions": versions, "exit_code": code,
              "execution_state": result["execution_state"], "verdict": result["verdict"],
              "expected": result["expected"], "passed": result["passed"], "failed": result["failed"],
              "observed_configuration": result["observed_configuration"],
              "actual_model": result["actual_model"],
              "cases": [{"case_id": row["case_id"], "verdict": row["verdict"]} for row in result["cases"]],
              "artifacts": {str(p.relative_to(root / "report")): hashlib.sha256(p.read_bytes()).hexdigest()
                            for p in (root / "report").rglob("*")
                            if p.name in {"result.json", "report.html", "events.jsonl"}}}
    (root / "summary.json").write_text(json.dumps(public, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(public, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
