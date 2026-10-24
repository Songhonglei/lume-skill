"""Product-scope checks followed by whole-suite skill-up validation; never run uploaded scripts."""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

import yaml

from backend.storage import PackageError, PackageFile, extract_files, safe_path
from worker.engine import CODEX_VERSION


def load_mapping(file: PackageFile, path: str) -> dict:
    try:
        value = yaml.safe_load(file.data.decode("utf-8"))
        if not isinstance(value, dict):
            raise PackageError(f"{path} 必须是 YAML 对象")
        return value
    except (UnicodeDecodeError, yaml.YAMLError) as error:
        raise PackageError(f"{path} 不是有效的 UTF-8 YAML：{error}") from error


def validate_suite(files: dict[str, PackageFile], skill_up: Path | None = None) -> dict:
    try:
        return _validate_suite(files, skill_up)
    except (TypeError, ValueError, AttributeError, RecursionError) as error:
        return {"valid": False, "issues": [{"path": "evals", "message": f"字段结构不符合预期：{type(error).__name__}"}],
                "warnings": [], "cases": [], "native": None}


def _validate_suite(files: dict[str, PackageFile], skill_up: Path | None = None) -> dict:
    issues, warnings, cases = [], [], []

    def issue(path, message):
        issues.append({"path": path, "message": message})

    def reference(value, field, *, must_exist=True, prefix=None):
        try:
            path = safe_path(value)
            if prefix and not path.startswith(prefix):
                raise PackageError(f"必须位于 {prefix}")
            if must_exist and path not in files and not any(p.startswith(path + "/") for p in files):
                raise PackageError("引用的文件或目录不存在")
            return path
        except PackageError as error:
            issue(field, str(error))
            return None

    def engine(value, field):
        if not isinstance(value, dict):
            issue(field, "引擎配置必须是对象")
            return
        if value.get("name", "codex") != "codex":
            issue(field + ".name", "一期只支持 Codex")
        if value.get("version") and str(value["version"]) != CODEX_VERSION:
            issue(field + ".version", f"当前固定 Codex {CODEX_VERSION}")
        for key in ("custom", "entry", "kwargs"):
            if value.get(key):
                issue(field + "." + key, "不支持自定义引擎入口或沙箱覆盖参数")
        model = value.get("model", {}) or {}
        if not isinstance(model, dict):
            issue(field + ".model", "模型配置必须是对象")
        else:
            for key in model:
                if key != "name":
                    issue(field + ".model." + key, "连接由 Worker 与系统配置统一提供，不从案例包导入")
            if model.get("name"):
                warnings.append({"path": field + ".model.name", "message": "执行时使用任务确认的统一模型；原声明保留在来源版本中"})

    def judge(value, field):
        if not isinstance(value, dict):
            issue(field, "需要配置一个裁判")
            return
        if value.get("type") not in {"rule_based", "script", "agent_judge"}:
            issue(field + ".type", "只支持 rule_based、script 或 agent_judge")
        if "engine" in value:
            engine(value["engine"], field + ".engine")
        if value.get("skills"):
            issue(field + ".skills", "裁判不额外安装其他 Skill")
        if value.get("script_path"):
            reference(value["script_path"], field + ".script_path", prefix="evals/fixtures/")
        if value.get("type") == "agent_judge":
            warnings.append({"path": field + ".model", "message": "语义裁判使用统一模型的独立 Codex 会话"})
            if "timeout_seconds" in value and (not isinstance(value["timeout_seconds"], int) or isinstance(value["timeout_seconds"], bool) or not 1 <= value["timeout_seconds"] <= 86400):
                issue(field + ".timeout_seconds", "语义裁判时限需要为 1–86400 秒")
        for rule in (value.get("success") or []) + (value.get("failure") or []):
            if isinstance(rule, dict):
                for name in ("files_exist", "files_not_exist"):
                    for path in rule.get(name) or []:
                        reference(path, field + "." + name, must_exist=False)
        context = value.get("context") or {}
        if isinstance(context, dict):
            for index, attachment in enumerate(context.get("attachments") or []):
                if isinstance(attachment, dict):
                    reference(attachment.get("path"), f"{field}.context.attachments[{index}]", prefix="evals/fixtures/")

    entry_name = "evals/eval.yaml"
    if entry_name not in files:
        issue(entry_name, "缺少评测集入口")
        return {"valid": False, "issues": issues, "warnings": warnings, "cases": cases}
    try:
        config = load_mapping(files[entry_name], entry_name)
    except PackageError as error:
        issue(entry_name, str(error))
        return {"valid": False, "issues": issues, "warnings": warnings, "cases": cases}
    if config.get("schema_version") != "v1alpha1":
        issue("schema_version", "需要 v1alpha1")
    environment = config.get("environment") or {}
    if not isinstance(environment, dict):
        issue("environment", "环境配置必须是对象")
        environment = {}
    if environment.get("type", "none") != "none":
        issue("environment.type", "执行环境由独立 Worker 提供，只接受 none")
    for key in environment:
        if key not in {"type", "setup_steps"}:
            issue("environment." + key, "该执行环境覆盖项不在一期支持范围内")
    engine(config.get("engine") or {"name": "codex"}, "engine")
    skills = config.get("skills") or [{"source": "local_path", "path": "."}]
    if not isinstance(skills, list) or len(skills) != 1 or not isinstance(skills[0], dict):
        issue("skills", "只接受当前 Skill 的本地快照")
    elif skills[0].get("source", "local_path") != "local_path" or skills[0].get("path", ".") != ".":
        issue("skills[0]", "Skill 路径必须是当前目录 .")
    elif any(skills[0].get(key) for key in ("target", "include", "exclude")):
        issue("skills[0]", "评测安装完整 Skill，不支持目标目录或文件筛选")
    benchmark = config.get("benchmark") or {}
    if not isinstance(benchmark, dict) or benchmark.get("enabled"):
        issue("benchmark.enabled", "一期不执行 with/without 基线比较")
    for field in ("mcp", "user_simulator", "judges"):
        if config.get(field):
            issue(field, "一期不支持 MCP、用户模拟器或多裁判")
    if "judge" in config:
        judge(config["judge"], "judge")
    group = config.get("cases") or {}
    if not isinstance(group, dict):
        issue("cases", "案例配置必须是对象")
        group = {}
    if group.get("parallelism", 1) != 1:
        issue("cases.parallelism", "一期按单案例并发执行")
    retry = group.get("retry_policy") or {}
    if not isinstance(retry, dict) or retry.get("max_retries", 0) != 0:
        issue("cases.retry_policy", "不自动重跑案例")
    for key in group:
        if key not in {"files", "defaults", "parallelism", "retry_policy"}:
            issue("cases." + key, "不支持案例筛选或未识别的执行设置")
    defaults = group.get("defaults") or {}
    if not isinstance(defaults, dict):
        issue("cases.defaults", "默认配置必须是对象")
        defaults = {}
    entries = group.get("files") or []
    if not isinstance(entries, list) or not entries:
        issue("cases.files", "至少需要一个案例")
        entries = []
    referenced, ids = set(), set()
    for index, value in enumerate(entries):
        field = f"cases.files[{index}]"
        path = reference(value, field, prefix="evals/cases/")
        if path is None or path not in files:
            continue
        if path in referenced:
            issue(field, "同一案例文件重复引用")
            continue
        referenced.add(path)
        try:
            case = load_mapping(files[path], path)
        except PackageError as error:
            issue(path, str(error))
            continue
        case_id = case.get("id", Path(path).stem)
        if not isinstance(case_id, str) or case_id != Path(path).stem or case_id in ids:
            issue(path + ":id", "案例 ID 必须与文件名一致且唯一")
            continue
        ids.add(case_id)
        data = case.get("input") or {}
        if not isinstance(data, dict) or not isinstance(data.get("prompt"), str) or not data["prompt"].strip():
            issue(path + ":input.prompt", "需要非空任务描述")
            data = {}
        if data.get("turns"):
            issue(path + ":input.turns", "当前固定单轮任务；上游多轮恢复路径会覆盖沙箱选项")
        for field_name in ("mcp", "user_simulator", "judges"):
            if case.get(field_name):
                issue(path + ":" + field_name, "一期不支持此配置")
        grader = case.get("judge", config.get("judge"))
        judge(grader, path + ":judge")
        context = case.get("context") or {}
        if not isinstance(context, dict):
            issue(path + ":context", "上下文必须是对象")
            context = {}
        fixture = context.get("repo_fixture")
        if fixture:
            reference(fixture, path + ":context.repo_fixture", prefix="evals/fixtures/")
            if isinstance(grader, dict) and str(grader.get("script_path", "")).startswith(str(fixture) + "/"):
                warnings.append({"path": path, "message": "判分脚本位于被测会话可见的附件目录，请检查答案是否泄露"})
        content_files = context.get("files") or {}
        if isinstance(content_files, dict):
            for relative in content_files:
                relative_path = reference(relative, path + ":context.files", must_exist=False)
                if relative_path and relative_path.split("/")[0] in {".codex", ".agents", ".git"}:
                    issue(path + ":context.files", "不能覆盖 Agent 配置或工作区元数据")
        git = context.get("git") or {}
        if isinstance(git, dict):
            if git.get("remotes"):
                issue(path + ":context.git.remotes", "一期不配置远程 Git 依赖")
            if git.get("apply_diff"):
                reference(git["apply_diff"], path + ":context.git.apply_diff", prefix="evals/fixtures/")
        expect = {**(defaults.get("expect") or {}), **(case.get("expect") or {})}
        if expect.get("golden_file"):
            reference(expect["golden_file"], path + ":expect.golden_file", prefix="evals/fixtures/")
        for name in ("files_exist", "files_not_exist"):
            for item in expect.get(name) or []:
                reference(item, path + ":expect." + name, must_exist=False)
        for item in expect.get("file_contains") or []:
            if isinstance(item, dict):
                reference(item.get("path"), path + ":expect.file_contains", must_exist=False)
        for pattern in (case.get("collect_artifacts") or []) + (defaults.get("collect_artifacts") or []):
            reference(pattern, path + ":collect_artifacts", must_exist=False)
        timeout = (case.get("constraints") or {}).get("timeout_seconds", defaults.get("timeout_seconds", 300))
        if not isinstance(timeout, int) or isinstance(timeout, bool) or not 1 <= timeout <= 86400:
            issue(path + ":constraints.timeout_seconds", "案例时限需要为 1–86400 秒")
            timeout = 300
        title = case.get("title") or case_id
        if not isinstance(title, str):
            issue(path + ":title", "案例名称必须是文本")
            title = case_id
        judge_timeout = (grader or {}).get("timeout_seconds") or (180 if (grader or {}).get("type") == "agent_judge" else 30)
        cases.append({"id": case_id, "file": path, "title": title,
                      "prompt": data.get("prompt", ""), "judge": (grader or {}).get("type") if isinstance(grader, dict) else None,
                      "timeout_seconds": timeout, "judge_timeout_seconds": judge_timeout})
    for name in files:
        if name.startswith("evals/cases/") and name.endswith((".yaml", ".yml")) and name not in referenced:
            issue(name, "案例文件未被入口引用；请加入清单或移除后再启用")
        if name.startswith("evals/fixtures/") and any(p in {".codex", ".agents", ".git"} for p in Path(name).parts):
            issue(name, "附件不能包含 Agent 配置或 Git 元数据")
    native = None
    if not issues and skill_up is not None:
        if not skill_up.is_file():
            issue("toolchain", "skill-up 尚未安装，不能确认校验通过")
        else:
            with tempfile.TemporaryDirectory(prefix="open-skill-eval-validate-") as directory:
                root = Path(directory)
                check_files = {**files, "SKILL.md": PackageFile(b"---\nname: validation-target\ndescription: validation only\n---\n")}
                extract_files(check_files, root / "suite")
                (root / "empty-config.yaml").write_text("{}\n")
                env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(root),
                       "GIT_CEILING_DIRECTORIES": str(root), "NO_COLOR": "1"}
                try:
                    checked = subprocess.run([str(skill_up.resolve()), "--config", str(root / "empty-config.yaml"),
                                              "validate", str(root / "suite/evals/eval.yaml")],
                                             env=env, capture_output=True, timeout=30, text=True, check=False)
                    native = {"exit_code": checked.returncode, "message": (checked.stdout + checked.stderr).replace(str(root), "<validation>")[-8000:]}
                    if checked.returncode:
                        issue(entry_name, native["message"])
                except (OSError, subprocess.TimeoutExpired) as error:
                    issue("toolchain", f"结构校验无法完成：{type(error).__name__}")
    return {"valid": not issues and bool(cases), "issues": issues, "warnings": warnings,
            "cases": cases, "native": native}


def normalize_suite(files: dict[str, PackageFile]) -> tuple[dict, list[dict]]:
    entries = [name for name in files if name.endswith("evals/eval.yaml") or name == "eval.yaml"]
    if len(entries) == 1:
        entry = entries[0]
        prefix = entry[:-len("evals/eval.yaml")] if entry.endswith("evals/eval.yaml") else ""
        if entry == "eval.yaml":
            return {"evals/" + name: value for name, value in files.items()}, []
        return {name[len(prefix):]: value for name, value in files.items()
                if name.startswith(prefix + "evals/")}, []
    json_entries = [name for name in files if Path(name).name == "evals.json"]
    if len(json_entries) != 1:
        raise PackageError("需要唯一的 evals/eval.yaml 或 evals.json")
    try:
        original = json.loads(files[json_entries[0]].data)
    except (ValueError, UnicodeDecodeError) as error:
        raise PackageError("evals.json 不是有效 JSON") from error
    rows = original.get("evals", []) if isinstance(original, dict) else original
    if not isinstance(rows, list):
        raise PackageError("evals.json 需要 evals 数组")
    output, entries, notes = {}, [], []
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not isinstance(row.get("prompt"), str):
            raise PackageError(f"evals[{index}].prompt 必须是文本")
        case_id = re.sub(r"[^a-zA-Z0-9_-]", "-", str(row.get("id", index + 1))).strip("-")
        case_id = f"case-{case_id or index+1}"
        path = f"evals/cases/{case_id}.yaml"
        if path in output:
            raise PackageError(f"转换后案例 ID 重复：{case_id}")
        criteria = row.get("expectations") or ([row["expected_output"]] if row.get("expected_output") else [])
        if not isinstance(criteria, list) or not all(isinstance(item, str) for item in criteria):
            raise PackageError(f"evals[{index}] 的预期条件必须是文本列表")
        case = {"id": case_id, "title": row.get("title") or case_id, "input": {"prompt": row["prompt"]},
                "judge": {"type": "agent_judge", "model": "__SELECT_MODEL__", "criteria": criteria}}
        for key in row:
            if key not in {"id", "title", "prompt", "expectations", "expected_output", "files"}:
                notes.append({"path": f"evals[{index}].{key}", "message": "原字段保留在上传原件中，未转换为执行设置"})
        if row.get("files"):
            raise PackageError(f"evals[{index}].files 的外部附件需要打包到 evals/fixtures 后使用原生格式导入")
        output[path] = PackageFile(yaml.safe_dump(case, allow_unicode=True, sort_keys=False).encode())
        entries.append(path)
    config = {"schema_version": "v1alpha1", "environment": {"type": "none"},
              "engine": {"name": "codex", "version": CODEX_VERSION},
              "skills": [{"source": "local_path", "path": "."}], "cases": {"files": entries},
              "report": {"formats": ["json", "html"]}}
    output["evals/eval.yaml"] = PackageFile(yaml.safe_dump(config, sort_keys=False).encode())
    notes.append({"path": "judge", "message": "预期条件转换为单个语义裁判标准；请预览确认，建议将确定性条件改为规则断言"})
    return output, notes
