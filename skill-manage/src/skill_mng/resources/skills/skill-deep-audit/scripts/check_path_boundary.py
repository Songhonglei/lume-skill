#!/usr/bin/env python3
"""D3-E5 read-only AST checker. No target module is imported or executed.

Usage: python3 check_path_boundary.py SKILL_PATH [--json] [--allow-external PATH]
Exit: 0 no confirmed ERR (inspect review_required), 1 ERR, 2 input/read/parse error.
Original MIT attribution is retained in ../LICENSE.
"""

import argparse
import ast
import json
from pathlib import Path


def scan_sources(sources, root, allowed=()):
    root = Path(root).resolve()
    findings, reviews = [], []
    for relative, text in sorted(sources.items()):
        if not relative.endswith(".py"):
            continue
        file_path, bound = root / relative, {}
        tree = ast.parse(text, filename=relative)

        def resolve(node):
            if isinstance(node, ast.Name):
                return file_path if node.id == "__file__" else bound.get(node.id)
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id == "Path" and len(node.args) == 1:
                    return resolve(node.args[0])
                if isinstance(node.func, ast.Attribute) and node.func.attr in {"resolve", "absolute"}:
                    return resolve(node.func.value)
                if isinstance(node.func, ast.Attribute) and node.func.attr == "joinpath":
                    base = resolve(node.func.value)
                    if base and all(
                        isinstance(x, ast.Constant) and isinstance(x.value, str) for x in node.args
                    ):
                        return base.joinpath(*(x.value for x in node.args)).resolve()
            if isinstance(node, ast.Attribute) and node.attr == "parent":
                base = resolve(node.value)
                return base.parent if base else None
            if (
                isinstance(node, ast.Subscript)
                and isinstance(node.value, ast.Attribute)
                and node.value.attr == "parents"
            ):
                base, index = resolve(node.value.value), node.slice
                if base and isinstance(index, ast.Constant) and type(index.value) is int:
                    try:
                        return base.parents[index.value]
                    except IndexError:
                        return None
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
                base = resolve(node.left)
                if base and isinstance(node.right, ast.Constant) and isinstance(node.right.value, str):
                    return (base / node.right.value).resolve()
            return None

        def statements(items):
            for stmt in items:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    saved = bound.copy()
                    if hasattr(stmt, "args"):
                        for arg in [*stmt.args.args, *stmt.args.kwonlyargs, *stmt.args.posonlyargs]:
                            bound.pop(arg.arg, None)
                    statements(stmt.body)
                    bound.clear()
                    bound.update(saved)
                    continue
                if isinstance(stmt, (ast.If, ast.For, ast.While, ast.Try, ast.With, ast.Match)):
                    # A conditional write invalidates sequential bindings before this branch.
                    for node in ast.walk(stmt):
                        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                            bound.pop(node.id, None)
                parents = {
                    child: parent for parent in ast.walk(stmt) for child in ast.iter_child_nodes(parent)
                }
                seen = set()
                for node in ast.walk(stmt):
                    is_chain = (
                        isinstance(node, ast.Attribute)
                        and node.attr == "parent"
                        or isinstance(node, ast.Subscript)
                        and isinstance(node.value, ast.Attribute)
                        and node.value.attr == "parents"
                    )
                    if not is_chain:
                        continue
                    outer = node
                    while isinstance(parents.get(outer), (ast.Attribute, ast.Subscript, ast.BinOp, ast.Call)):
                        candidate = parents[outer]
                        if resolve(candidate) is None:
                            break
                        outer = candidate
                    if id(outer) in seen:
                        continue
                    seen.add(id(outer))
                    endpoint = resolve(outer)
                    location = {"file": relative, "line": node.lineno}
                    if endpoint is None:
                        reviews.append(
                            {
                                **location,
                                "reason": "Dynamic/cross-file anchor or unsupported index; verify caller and configured base.",
                            }
                        )
                    elif not (endpoint == root or root in endpoint.parents) and not any(
                        endpoint == Path(a).resolve() or Path(a).resolve() in endpoint.parents
                        for a in allowed
                    ):
                        findings.append(
                            {
                                **location,
                                "endpoint": str(endpoint),
                                "code": ast.get_source_segment(text, outer) or "",
                            }
                        )
                if isinstance(stmt, (ast.Assign, ast.AnnAssign)):
                    targets = stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target]
                    value = resolve(stmt.value)
                    for target in targets:
                        if isinstance(target, ast.Name):
                            bound.pop(target.id, None)
                            if value is not None:
                                bound[target.id] = value
                if isinstance(stmt, (ast.If, ast.For, ast.While, ast.Try, ast.With)):
                    for node in ast.walk(stmt):
                        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                            bound.pop(node.id, None)

        statements(tree.body)

    def unique(rows):
        return list({json.dumps(x, sort_keys=True): x for x in rows}.values())

    findings, reviews = unique(findings), unique(reviews)
    return {
        "err_count": len(findings),
        "review_required": bool(reviews),
        "findings": findings,
        "review_findings": reviews,
        "errors": [],
    }


def scan_result(path, allowed=()):
    root = Path(path).resolve()
    if not root.is_dir():
        raise ValueError("Skill directory does not exist")
    sources = {}
    for file in sorted(root.rglob("*.py")):
        if any(
            p in {"node_modules", ".git", "__pycache__", ".venv", "venv"}
            for p in file.relative_to(root).parts
        ):
            continue
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError("Symbolic or escaping source path")
        if file.stat().st_size > 262144:
            raise ValueError("Source exceeds 256 KiB checker limit; manual review required")
        sources[str(file.relative_to(root))] = file.read_text(encoding="utf-8")
    return scan_sources(sources, root, allowed)


def scan(path):
    return scan_result(path)["findings"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skill_path", type=Path)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--allow-external", action="append", default=[])
    args = parser.parse_args()
    try:
        result = scan_result(args.skill_path, args.allow_external)
    except (OSError, ValueError, SyntaxError, RecursionError) as exc:
        print(
            json.dumps(
                {"err_count": 0, "review_required": True, "errors": [type(exc).__name__], "findings": []}
            )
        )
        return 2
    print(
        json.dumps(result, ensure_ascii=False, indent=2)
        if args.json
        else f"ERR: {result['err_count']}; review required: {result['review_required']}"
    )
    return 1 if result["err_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
