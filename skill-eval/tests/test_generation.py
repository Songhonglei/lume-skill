from pathlib import Path

import pytest

from worker.engine import EngineError
from worker.generate import generate


def test_generation_requires_explicit_inputs_without_running_evaluation(tmp_path, monkeypatch):
    source, candidate, assets = (tmp_path / name for name in ("skill", "candidate", "assets"))
    source.mkdir()
    original = b"---\nname: synthetic\ndescription: test\n---\nPreserve input exactly."
    (source / "SKILL.md").write_bytes(original)
    # Bundled evals must not become input or output for the new generation.
    (source / "evals").mkdir()
    (source / "evals/old.yaml").write_text("old case")
    calls = []
    monkeypatch.setattr("worker.generate.check_sandbox", lambda *args: None)

    def capture(command, cwd, *args):
        calls.append(command)
        assert cwd == candidate
        target = tmp_path / "candidate-target"
        assert (target / "SKILL.md").read_bytes() == original
        assert not (target / "evals").exists()
        (cwd / "evals").mkdir()
        (cwd / "evals/eval.yaml").write_text("schema_version: v1alpha1\n")
        return 0

    monkeypatch.setattr("worker.generate.run_process", capture)
    result = generate(source, candidate, assets, "test-model", 3, "覆盖中文和空文本", {})
    assert len(calls) == 1
    assert calls[0][:2] == ["codex", "exec"]
    assert calls[0][calls[0].index("--sandbox") + 1] == "workspace-write"
    prompt = calls[0][-1]
    for requirement in ("明确点名目标", '实际输入（JSON 字符串）：""', "长度 0", "不是缺少输入", "仅空格和仅换行", "完整关键结果", "output_matches",
                        "未定义的行为不得自行编造", "答案、golden", "不自动启用或评测", "不运行 skill-up run"):
        assert requirement in prompt
    assert prompt.endswith("覆盖中文和空文本\n")
    assert result["entry_exists"] and result["target_count"] == 3
    assert (source / "SKILL.md").read_bytes() == original
    assert (source / "evals/old.yaml").read_text() == "old case"


@pytest.mark.parametrize("count", [0, 31])
def test_invalid_generation_count_never_creates_draft(tmp_path, count):
    candidate = tmp_path / "candidate"
    with pytest.raises(EngineError, match="between 1 and 30"):
        generate(Path("unused"), candidate, Path("unused"), "test-model", count, "", {})
    assert not candidate.exists()
