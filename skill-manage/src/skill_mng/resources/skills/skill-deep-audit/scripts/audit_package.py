#!/usr/bin/env python3
"""Bounded static preflight and frozen report contract; never executes target scripts.

Standalone: python3 audit_package.py SKILL_PATH --depth L1 --registered-version VERSION --output OUTPUT_DIR
Static preflight reports review_required until semantic rule coverage is supplied by an Agent.
Outputs result.json and report.md outside the target. Exit 0 completed, 1 confirmed FAIL, 2 input/checker error.
"""

import argparse
import ast
import hashlib
import importlib.util
import json
import re
import stat
import zipfile
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
RULE_VERSION = "deep-audit-1.2.0-platform.1"


def catalogue(depth="L1"):
    data = json.loads((SKILL_ROOT / "references/rules.json").read_text())["rules"]
    return {r["id"]: r for r in data if depth == "L2" or r["depth"] == "L1"}


def finding(rule, message, file="SKILL.md", line=1, *, review=False):
    identity = hashlib.sha256(f"{rule}|{file}|{line}|{message}".encode()).hexdigest()[:24]
    return {
        "id": identity,
        "ruleId": rule,
        "file": file,
        "line": line,
        "message": message,
        "suggestion": "按该规则修正对应位置，保留已授权范围。",
        "verification": "修改后重新执行该规则，并完成独立复审。",
        "reviewRequired": review,
    }


def static_checks(files, registered_version=None, depth="L1", metadata=None, virtual_root="/skill"):
    findings, checked = [], set()
    sources = {}
    for path, raw in files.items():
        if len(raw) > 262144:
            findings.append(finding("D3-E6", "文件超过自动检查读取上限，需人工复核。", path, review=True))
            continue
        try:
            sources[path] = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            if Path(path).suffix in {
                ".py",
                ".sh",
                ".md",
                ".js",
                ".ts",
                ".cjs",
                ".mjs",
                ".json",
                ".yaml",
                ".yml",
            }:
                findings.append(
                    finding("D3-E6", "文本文件无法按 UTF-8 读取，检查未完成。", path, review=True)
                )
    text = sources.get("SKILL.md", "")
    header = re.match(r"^---\s*\n(.*?)\n---(?:\n|$)", text, re.S)
    parsed = dict(metadata or {})
    if metadata is None and header:
        for key in ("name", "description", "version"):
            match = re.search(r"^" + key + r":\s*(.*?)(?=\n\S|\Z)", header[1], re.M | re.S)
            if match:
                parsed[key] = match[1].strip().strip("\"'")
    if not header or not parsed.get("name") or not parsed.get("description") or parsed.get("parse_warning"):
        findings.append(finding("D4-E1", "YAML 头缺少可解析的 name/description，或头部格式无效。"))
    checked.add("D4-E1")
    description = parsed.get("description", "")
    if len(description) < 30 or not re.search(r"when|\buse\b|\bfor\b|当|用于|适用|需要", description, re.I):
        findings.append(finding("D4-E2", "description 需说明明确的触发时机，且至少 30 字符。"))
    checked.add("D4-E2")
    if not re.search(
        r"prerequis|prereqs|before (?:you start|use)|depends on|requires|no dependencies|works out of the box|前置|依赖|无需安装|开箱即用",
        text,
        re.I,
    ):
        findings.append(finding("D4-E3", "请说明前置条件；无依赖时明确写明无需特殊前置条件。"))
    checked.add("D4-E3")
    declared = parsed.get("version")
    body_version = re.search(
        r"(?:\*\*)?(?:Version|版本)(?:\*\*)?\s*[:：]\s*`?([A-Za-z0-9._+\-]+)", text, re.I
    )
    versions = set(filter(None, [declared, body_version[1] if body_version else None]))
    if not declared:
        findings.append(finding("D4-W7", "YAML 头未声明版本；登记版本与文件声明分别保留。"))
    if registered_version and versions and any(v != registered_version for v in versions):
        findings.append(finding("D7-E1", "Skill 声明版本与固定登记版本不一致（0 分 ERR）。"))
    checked.update({"D4-W7", "D7-E1"})
    lines = len(text.splitlines())
    if lines > 600:
        findings.append(
            finding("D4-E6", "SKILL.md 超过 600 行，需保留护栏和流程、拆分实现细节（0 分 ERR）。")
        )
    elif lines > 400:
        findings.append(finding("D4-W6", "SKILL.md 超过 400 行，建议将实现细节移到明确引用的资源中。"))
    checked.update({"D4-E6", "D4-W6"})
    for path in files:
        if any(p in {".git", "node_modules"} for p in Path(path).parts) or path.endswith((".zip", ".tar.gz")):
            findings.append(finding("D4-E5", "包中包含历史/依赖目录或嵌套发布包。", path))
    checked.add("D4-E5")
    valid_python = {}
    for path, code in sources.items():
        if path.endswith(".py"):
            try:
                ast.parse(code, filename=path)
                valid_python[path] = code
            except (SyntaxError, ValueError, RecursionError) as exc:
                findings.append(
                    finding(
                        "D6-E1", "Python 语法解析失败；未运行目标模块。", path, getattr(exc, "lineno", 1) or 1
                    )
                )
        if Path(path).suffix in {".py", ".sh", ".js", ".cjs", ".mjs", ".ts", ".json", ".yaml", ".yml"}:
            for line_no, line in enumerate(code.splitlines(), 1):
                if line.lstrip().startswith(("#", "//")):
                    continue
                if re.search(
                    r"\b(?:token|api_key|apiKey|password|secret)\s*[:=]\s*[\"\'][A-Za-z0-9_+\-/]{20,}",
                    line,
                    re.I,
                ):
                    findings.append(finding("D5-E1", "疑似明文凭据赋值；报告不回显具体值。", path, line_no))
                if re.search(
                    r"^\s*(?:(?:const|let|var|export)\s+)?\w+\s*=.*(?:/Users/[\w-]+/|/home/[\w-]+/|C:\\\\Users\\\\)",
                    line,
                ):
                    findings.append(
                        finding("D3-E1", "代码赋值包含具体用户目录，迁移后可能失效。", path, line_no)
                    )
    checked.update({"D6-E1", "D5-E1", "D3-E1"})
    spec = importlib.util.spec_from_file_location(
        "_trusted_path_checker", SKILL_ROOT / "scripts/check_path_boundary.py"
    )
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)  # Fixed bundled checker only; never load a target file as code.
    paths = checker.scan_sources(valid_python, Path(virtual_root))
    for item in paths["findings"]:
        findings.append(
            finding(
                "D3-E5", "由 __file__ 推导的最终路径越出 Skill 目录（0 分 ERR）。", item["file"], item["line"]
            )
        )
    for item in paths["review_findings"]:
        findings.append(finding("D3-E5", item["reason"], item["file"], item["line"], review=True))
    checked.add("D3-E5")
    if depth == "L2":
        findings.append(finding("D7-W1", "未配置可选 Hub 查询工具，无法核验发布状态；已按规则降为 WARN。"))
        checked.add("D7-W1")
    return {"findings": findings, "checkedRuleIds": sorted(checked), "semanticCompleted": False}


def evaluate(findings, depth, checked_rule_ids, semantic_completed):
    if depth not in {"L1", "L2"} or type(semantic_completed) is not bool:
        raise ValueError("Invalid depth or semantic completion flag")
    if not isinstance(checked_rule_ids, list) or not all(isinstance(x, str) for x in checked_rule_ids):
        raise ValueError("Invalid coverage")
    rules = catalogue(depth)
    normalized = []
    seen = set()
    for row in findings:
        if row["ruleId"] not in rules:
            raise ValueError("Unknown or inactive rule")
        if row["id"] in seen:
            raise ValueError("Duplicate finding ID")
        seen.add(row["id"])
        if (
            len(row.get("message", "")) > 4000
            or len(row.get("file", "")) > 500
            or type(row.get("line")) is not int
            or row["line"] < 1
        ):
            raise ValueError("Invalid finding location/message")
        rule = rules[row["ruleId"]]
        if type(row.get("reviewRequired")) is not bool:
            raise ValueError("reviewRequired must be boolean")
        review = row["reviewRequired"]
        normalized.append(
            {
                **row,
                "severity": "REVIEW" if review else rule["severity"],
                "points": 0 if review else rule["points"],
            }
        )
    normalized.sort(
        key=lambda r: ({"ERR": 0, "WARN": 1, "REVIEW": 2}[r["severity"]], r["ruleId"], r["file"], r["line"])
    )
    deductions = {row["ruleId"]: row["points"] for row in normalized if not row["reviewRequired"]}
    maximum = sum(r["points"] for r in rules.values())
    score = maximum - sum(deductions.values())
    errors = sum(r["severity"] == "ERR" for r in normalized)
    warnings = sum(r["severity"] == "WARN" for r in normalized)
    coverage = set(checked_rule_ids)
    if not coverage.issubset(rules):
        raise ValueError("Unknown checked rule")
    review = not semantic_completed or coverage != set(rules) or any(r["reviewRequired"] for r in normalized)
    verdict = "fail" if errors or score < 90 else "review_required" if review else "pass"
    return {
        "findings": normalized,
        "score": score,
        "maxScore": maximum,
        "errorCount": errors,
        "warningCount": warnings,
        "reviewRequired": review,
        "verdict": verdict,
        "checkedRuleIds": sorted(coverage),
        "semanticCompleted": bool(semantic_completed),
    }


def render_report(result):
    lines = [
        "# Skill 审计报告",
        "",
        f"- 结论：{result['verdict']}",
        f"- 分数：{result['score']}/{result['maxScore']}",
        f"- ERR：{result['errorCount']}；WARN：{result['warningCount']}",
        f"- 待复核：{result['reviewRequired']}",
        f"- 版本 ID：{result.get('versionId', 'standalone')}",
        f"- 内容摘要：{result.get('contentDigest', 'directory')}",
        f"- 规则：{RULE_VERSION}",
        "",
        "## 问题",
        "",
    ]
    for row in result["findings"]:
        lines.extend(
            [
                f"### {row['ruleId']} · {row['severity']} · {row['file']}:{row['line']}",
                row["message"],
                f"建议：{row['suggestion']}",
                f"验证：{row['verification']}",
                "",
            ]
        )
    if not result["findings"]:
        lines.append("未发现已确认问题。")
    if result["reviewRequired"]:
        lines.extend(["", "必要规则或语义检查尚未完成，不能作为通过审计的依据。"])
    return "\n".join(lines) + "\n"


def freeze_result(manifest, findings, checked, semantic_completed):
    result = {
        key: manifest[key]
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
        )
        if key in manifest
    }
    result.update(schemaVersion=1, **evaluate(findings, manifest["depth"], checked, semantic_completed))
    result["repairPrompt"] = (
        "仅修复明确授权的问题 ID；原包保持不变，修改候选后做全量独立复审。\n"
        + "\n".join(
            f"{r['id']}: {r['ruleId']} {r['file']}:{r['line']} {r['suggestion']}" for r in result["findings"]
        )
    )
    result["reportMarkdown"] = render_report(result)
    result["reportDigest"] = hashlib.sha256(result["reportMarkdown"].encode()).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skill_path", type=Path)
    parser.add_argument("--depth", choices=["L1", "L2"], default="L1")
    parser.add_argument("--registered-version")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--artifact", type=Path)
    parser.add_argument("--semantic-result", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        root = args.skill_path.resolve()
        output = args.output.resolve()
        if not root.is_dir() or output.exists() or output == root or output.is_relative_to(root):
            raise ValueError("Output must be outside an existing skill directory")
        files = {}
        total = 0
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise ValueError("Symlinks are not supported")
            if not path.is_dir() and not path.is_file():
                raise ValueError("Special files are not supported")
            if path.is_file():
                size = path.stat().st_size
                total += size
                if len(files) >= 500 or size > 4194304 or total > 33554432:
                    raise ValueError("Package exceeds file/size limits")
                files[str(path.relative_to(root))] = path.read_bytes()
        if "SKILL.md" not in files:
            raise ValueError("SKILL.md is required")
        manifest = {"depth": args.depth, "ruleVersion": RULE_VERSION}
        identity = hashlib.sha256()
        for name, raw in sorted(files.items()):
            identity.update(name.encode() + b"\0" + hashlib.sha256(raw).hexdigest().encode() + b"\n")
        manifest["contentDigest"] = identity.hexdigest()
        if args.manifest:
            if args.manifest.stat().st_size > 65536:
                raise ValueError("Manifest too large")
            supplied = json.loads(args.manifest.read_text())
            if supplied.get("schemaVersion") != 1 or supplied.get("ruleVersion") != RULE_VERSION:
                raise ValueError("Unsupported manifest schema/rules")
            for key in ("taskId", "auditRunId", "attemptId", "versionId"):
                if not re.fullmatch(r"[a-f0-9]{32}", supplied.get(key, "")):
                    raise ValueError("Missing or invalid identity")
            if type(supplied.get("leaseGeneration")) is not int or supplied["leaseGeneration"] < 1:
                raise ValueError("Invalid attempt generation")
            if supplied.get("depth") not in {"L1", "L2"} or not isinstance(
                supplied.get("registeredVersion"), str
            ):
                raise ValueError("Missing depth/version")
            if supplied.get("contentDigest") != identity.hexdigest():
                raise ValueError("Directory digest differs from manifest")
            if not args.artifact or args.artifact.stat().st_size > 16777216:
                raise ValueError("Original artifact is required and bounded to 16 MiB")
            if hashlib.sha256(args.artifact.read_bytes()).hexdigest() != supplied.get("artifactDigest"):
                raise ValueError("Artifact digest differs from manifest")
            with zipfile.ZipFile(args.artifact) as archive:
                members = [i for i in archive.infolist() if not i.is_dir()]
                roots = [i.filename[: -len("SKILL.md")] for i in members if i.filename.endswith("SKILL.md")]
                if "SKILL.md" in archive.namelist():
                    prefix = ""
                elif len(roots) == 1:
                    prefix = roots[0]
                else:
                    raise ValueError("Ambiguous artifact root")
                if len(members) != len(files):
                    raise ValueError("Artifact members differ")
                seen = set()
                for member in members:
                    name = member.filename[len(prefix) :] if member.filename.startswith(prefix) else None
                    if name not in files or name in seen or member.file_size != len(files[name]):
                        raise ValueError("Artifact member identity differs")
                    kind = stat.S_IFMT(member.external_attr >> 16)
                    if member.flag_bits & 1 or kind not in (0, stat.S_IFREG):
                        raise ValueError("Unsupported artifact member")
                    if archive.read(member) != files[name]:
                        raise ValueError("Artifact content differs")
                    seen.add(name)
            manifest = supplied
        depth = manifest["depth"]
        checks = static_checks(
            files, manifest.get("registeredVersion", args.registered_version), depth, virtual_root=root
        )
        findings, checked, completed = checks["findings"], set(checks["checkedRuleIds"]), False
        if args.semantic_result:
            if (
                args.semantic_result.resolve().is_relative_to(root)
                or args.semantic_result.stat().st_size > 2097152
            ):
                raise ValueError("Semantic evidence must be bounded and outside target")
            evidence = json.loads(args.semantic_result.read_text())
            if not isinstance(evidence.get("findings"), list) or len(evidence["findings"]) > 200:
                raise ValueError("Invalid semantic evidence")
            seen = {(r["ruleId"], r["file"], r["line"]) for r in findings}
            for row in evidence["findings"]:
                if row["file"] not in files or type(row["reviewRequired"]) is not bool:
                    raise ValueError("Invalid finding location/flag")
                if (row["ruleId"], row["file"], row["line"]) in seen:
                    continue
                entry = finding(
                    row["ruleId"], row["message"], row["file"], row["line"], review=row["reviewRequired"]
                )
                for key in ("suggestion", "verification"):
                    if not isinstance(row[key], str) or len(row[key]) > 4000:
                        raise ValueError("Invalid finding explanation")
                    entry[key] = row[key]
                findings.append(entry)
                seen.add((row["ruleId"], row["file"], row["line"]))
            checked.update(evidence["checkedRuleIds"])
            completed = evidence["semanticCompleted"]
        result = freeze_result(manifest, findings, sorted(checked), completed)
        output.mkdir(parents=True, exist_ok=False, mode=0o700)
        for name, content in [
            ("result.json", json.dumps(result, ensure_ascii=False, indent=2)),
            ("report.md", result["reportMarkdown"]),
        ]:
            with (output / name).open("x", encoding="utf-8") as handle:
                handle.write(content)
            (output / name).chmod(0o600)
        print(
            json.dumps(
                {
                    "verdict": result["verdict"],
                    "score": result["score"],
                    "maxScore": result["maxScore"],
                    "output": str(output),
                },
                ensure_ascii=False,
            )
        )
        return 1 if result["verdict"] == "fail" else 0
    except (OSError, ValueError, SyntaxError, RecursionError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        print(
            json.dumps(
                {"error": type(exc).__name__, "message": "检查未完成：核对输入、输出目录和读取权限。"},
                ensure_ascii=False,
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
