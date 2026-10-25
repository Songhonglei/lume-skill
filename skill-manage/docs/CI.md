# T04：项目专用检查与产物证据

`.github/workflows/skill-manage-checks.yml` 只响应本项目或自身工作流变化，覆盖 main push、PR 和手动触发。独立于 Skill Eval 的 CI；只有 `contents: read`，不使用模型密钥，不部署、不发包、不推镜像。GitHub Actions 固定到已核对的 commit SHA；uv 固定 0.12.3。

矩阵为 Ubuntu 24.04 的 Python 3.11/3.12/3.13，以及 macOS 14 的 Python 3.12。工作流已在本地编写并检查；未推送前不能宣称 GitHub 托管 runner 已通过此矩阵。T03 的真实跨机器 HTTPS、arm64/x86_64 部署组合也不由这份矩阵替代。

## 每次检查

1. `uv sync --locked --extra dev`，ruff check/format、JS 语法、Git 差异空白检查、完整 pytest。
2. 14 例实际 Web/worker 静态回归，模型调用必须为 0。
3. 从源码构建 wheel/sdist；从 uv.lock 导出运行依赖并与 `requirements.lock` 比较。
4. `python3 -m skill_mng.distribution` 比对所有应用文件、全部允许的 sdist 源文件、包版本和许可证；拒绝多余代码、运行配置、数据库、日志、环境文件、链接和越界成员，生成 SHA-256 清单。
5. 新 venv 安装固定运行依赖和 wheel，执行现有 7 组实进程 CLI/worker/备份恢复烟测。
6. 只上传明确列出的静态回执、产物 manifest、烟测结果和候选 wheel/sdist，保留 14 天。不会上传整个 `.local/`、venv、日志或模型配置。

锁文件检查遵循 [uv 的 locked 同步](https://docs.astral.sh/uv/concepts/projects/sync/)；工作流使用 [GitHub Python 矩阵](https://github.com/actions/setup-python/blob/main/docs/advanced-usage.md)及固定动作版本。构建设置 `SOURCE_DATE_EPOCH=1700000000`，便于在相同工具链下复查一致产物；跨 Python/平台二进制摘要是否一致以实际 manifest 为准，不推定跨平台字节一致。

## 本地复查

在 `skill-manage/` 中：

```bash
uv sync --locked --extra dev
uv run python3 -m pytest -q
uv run ruff check src tests
uv run ruff format --check src tests
node --check src/skill_mng/static/app.js
uv run python3 -m skill_mng.regression --mode static --output .local/static-ci-01.json
SOURCE_DATE_EPOCH=1700000000 uv build --out-dir dist
uv export --locked --no-dev --no-emit-project --no-hashes --no-header \
  --format requirements-txt --output-file .local/runtime-requirements.txt
uv run python3 -m skill_mng.distribution --dist-dir dist \
  --runtime-requirements .local/runtime-requirements.txt --output .local/manifest-ci-01.json
uv venv --python 3.12 .local/wheel-env
uv pip install --python .local/wheel-env/bin/python --no-deps -r .local/runtime-requirements.txt
uv pip install --python .local/wheel-env/bin/python --no-deps dist/open_skill_mng-0.3.2.dev3-py3-none-any.whl
uv run python3 tests/smoke_wheel.py .local/wheel-env/bin/skill-mng
```

使用新的输出路径保留历史记录。`distribution` 只读检查已有产物；不重打包旧版。manifest 包含源文件树摘要、逐文件 SHA-256、构建物 SHA-256、版本、依赖锁/许可/运行数据排除结果。能找到 Git 时另外记录 commit 与本项目工作区是否有改动；未提交构建不能冒充干净提交的发行物。无 Git 的 sdist 环境仍可用源文件树摘要核对。

本轮可迁移的确定性输入、公开样例来源及静态回执均进入 Git；动态构建清单和候选包保留在 CI artifacts 或本地 ignored 目录，避免把产物自身摘要嵌入源码造成循环依赖。历史 0.3.1 及已验收 0.3.2.dev1 产物摘要保持；当前开发版本为 0.3.2.dev3。

## 尚未执行的发布步骤

没有配置 PyPI/GHCR 发布凭据、公开 release job 或自动模型 CI。真实模型回归需要明确配置和调用预算，通过 [T02 工具](REGRESSION.md)显式运行；不会在普通 PR 上收费。后续公开包/镜像发布仍需指定目标、权限和验收，不从 CI 检查推断发布授权。
