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
案例明确性要求（编写后逐项检查文件，不执行案例）：
- 每个 input.prompt 都明确点名目标 SKILL.md 中声明的 Skill 名称，不只写“你的 Skill”；写出完整任务、实际输入及其边界，不能只写“处理以下文本”却不提供文本。
- 区分零长度空字符串、未提供输入、仅空格和仅换行。空字符串直接写“实际输入（JSON 字符串）：\"\"；解码后长度 0，不是缺少输入，不要请求补充文本”，不要在成对分隔符之间放入“输入开始/结束”等说明文字而声称其中为空。
- 普通文本也要用清晰分隔符区分任务指令和待处理数据，明确哪些符号属于输入；保留大小写、空格、换行和标点的约定。
- 预期行为必须来自 Skill 的明确约定。未定义的行为不得自行编造通过条件；改选有依据的场景，必要时少生成并说明，不能为凑数量复制案例。
- 断言要覆盖约定的完整关键结果及失败条件。精确输出场景应使用 output_matches 等支持的规则校验完整输出（Go 正则的起止锚点，正确转义字面值）；仅包含通用词、任意回复或只匹配固定前缀不能证明正确。
- 语义裁判写出可观察、可判定的标准；脚本同时拒绝错误结果。不要通过删减或放宽断言使案例看似通过。
- 所需附件必须实际提供并正确引用；答案、golden 文件和判分依据不得放入被测会话可见的 context 文件或 repo_fixture。
- 不留下待填写占位符，不添加上游不支持的字段。只做静态自查，生成产物仍是待人工审查的草稿，不自动启用或评测。
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
