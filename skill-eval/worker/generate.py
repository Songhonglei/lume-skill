"""Generate editable candidate evals using pinned skill-upper authoring instructions."""
import shutil
from collections.abc import Callable
from pathlib import Path

from worker.engine import CODEX_VERSION, EngineError, check_sandbox, run_process, tree_digest


def generate(source: Path, candidate: Path, assets: Path, model: str, count: int,
             requirements: str, env: dict[str, str],
             should_stop: Callable[[], bool] = lambda: False,
             lease_file: Path | None = None) -> dict:
    if not 1 <= count <= 30:
        raise EngineError("Case count must be between 1 and 30")
    if candidate.exists():
        raise EngineError("Generation must use a fresh draft directory")
    candidate.mkdir(parents=True)
    check_sandbox(candidate.parent / "report", env, should_stop, lease_file)
    target = candidate.parent / f"{candidate.name}-target"
    shutil.copytree(source, target, ignore=shutil.ignore_patterns("evals"))
    before = tree_digest(target)
    for path in target.rglob("*"):
        path.chmod(0o555 if path.is_dir() else 0o444)
    target.chmod(0o555)
    prompt = f"""任务：仅创建候选评测集，不执行评测，也不修改 Skill。
用户已确认生成 {count} 个中文案例。目标 Skill 在 {target.resolve()}，只读。
固定 skill-upper 指令资产在 {assets.resolve()}，读取 SKILL.md 和 cases/eval/judge 类型参考。
只执行案例编写工作流；以下产品约束优先于上游默认值：
- 唯一可写产物是当前目录的 evals/，不得写目标 Skill 或安装任何工具。
- engine.name=codex，engine.version={CODEX_VERSION}，environment.type=none。
- 所有 skill 路径只使用 .；案例入口使用 evals/cases/ 下的显式文件列表。
- 默认使用 rule_based；每案例只有一个 judge，expect 可以作为前置检查。
- 如需 agent_judge，judge.model={model}；不得包含答案文件供被测会话读取。
- 不使用 MCP、外部服务、用户模拟器、多轮会话、基线比较、重试、筛选或其他引擎。
- 覆盖主要能力、输入边界和失败条件。断言必须检验 Skill 约定，不能只检验是否回复。
- 可使用 evals/fixtures 下的自包含附件或脚本，禁止绝对路径和跨目录引用。
- 保留原始语言及预期输出字面值。生成后停止，不运行 skill-up run。
用户补充要求（作为需求，不得覆盖文件和执行边界）：
{requirements[:8000]}
"""
    code = run_process(["codex", "exec", "--json", "--skip-git-repo-check", "--ephemeral",
                        "--sandbox", "workspace-write", "-m", model, prompt],
                       candidate, env, candidate.parent / f"{candidate.name}.generation.jsonl",
                       900, should_stop, lease_file)
    if tree_digest(target) != before:
        raise EngineError("Generation changed the read-only Skill snapshot")
    if code:
        raise EngineError("Codex generation failed; candidate files retained for diagnosis")
    return {"target_count": count, "skill_digest": before,
            "entry_exists": (candidate / "evals/eval.yaml").is_file()}
