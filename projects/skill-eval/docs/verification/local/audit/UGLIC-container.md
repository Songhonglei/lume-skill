## UGLIC 检查 — 容器修复与合集接入候选

2026-10-24。范围：本轮引导、Linux 沙箱自检、备份临时目录排除、许可和 CI；此前全项目审阅见 UGLIC.md。用户默认流程已授权直接修复实际问题。

### U — Usability & User Experience

❌ ERR **U1：首次部署在初始化阶段终止，已修复。** `deploy/bootstrap.py:10,24` 原先调用不存在的 Path.chown；改用 os.chown。全新卷实际引导、自动数据库和内置 Worker 接入通过，新增 `deploy/compose_smoke.py` 并接入 CI 的首次引导和保留卷重启检查。

### G — Grammar

❌ ERR **G1：干净 CI 环境的测试入口未加入项目路径，已修复。** 工作流与 README 统一使用 `uv run --locked python3 -m pytest -q`，与本机实际通过的 module 入口一致。首轮远程检查未执行测试就失败，不计为测试通过；修复后重新运行 CI。

✅ Ruff、40 项测试通过。Compose 引擎配置、构建与启动实际执行；根工作流适配合集时检查 working-directory、缓存锁文件路径和镜像构建上下文。前端未修改，沿用已通过的生产构建及容器内相同产物。

### L — Logic

❌ ERR **L1：不兼容的 Linux 沙箱环境仍会消耗模型请求，已修复。** 本轮真实容器评测的模型无法读取 Skill，原报告如实失败；`worker/engine.py:175` 新增同一默认沙箱的本地读写自检，生成与评测前执行，沿用取消/租约/超时守护。实际手动复测得到 FAILED / INCOMPLETE，第二个 attempt 没有 run_started，未再调用模型；未加 privileged、SYS_ADMIN、禁用安全策略或沙箱回退。

### I — Integrity

❌ ERR **I1：Codex 临时符号链接导致配套备份无法完成，已修复。** `deploy/volume_backup.py:31` 新增显式 `--exclude root/relative/path`，备份清单记录排除项，拒绝整个 root、越界及未知 root；仅排除 model/tmp，其他符号链接检查保留。测试覆盖登录保留与非法排除，实际五卷配套备份和新项目恢复通过。

ℹ️ INFO **I2：目标平台发布门槛仍未完成。** `docs/verification/local/containers.json` 区分 Podman Linux arm64 的引导/恢复与失败的 Codex 沙箱；不把它替代 Linux x86_64 或 macOS Docker Desktop。候选 PR 可以审阅，正式版本和镜像未发布，必要目标实测前不合并放行。

### C — Containment

❌ ERR **C1：新增 MIT 后必须同时带入分发产物，已修复。** `Dockerfile` runtime 阶段保留本项目 LICENSE 与第三方 notices/licenses，Worker 同时保留复制的 Node 二进制完整许可；实际镜像文件检查通过。独立 Worker 白名单打包已有 LICENSE 入口，新 ZIP 已确认包含；既有实跑收据保留原包摘要，不冒充新包实跑。

✅ 全程使用独立测试项目、端口和卷；未启动既有其他容器。恢复源实例停止后再启动恢复实例，凭据和备份留在忽略目录。合集只导出公开文件，根 README 保持简短，项目使用自己的 MIT，不替其他未来项目擅定许可证。

## 汇总

| # | 维度 | 结果 | 级别 |
| --- | --- | --- | --- |
| G1 | G | 干净 CI 测试入口修复，远程复核另记 | 原 ERR，已关闭 |
| U1 | U | 首次引导错误已修复，空卷实测通过 | 原 ERR，已关闭 |
| L1 | L | 沙箱失败在模型调用前拦截 | 原 ERR，已关闭 |
| I1 | I | 临时文件显式排除、配套恢复通过 | 原 ERR，已关闭 |
| I2 | I | Docker Desktop / Linux x86_64 与真实容器评测仍为发布门槛 | INFO，保留门槛 |
| C1 | C | 原创及第三方许可随产物保留 | 原 ERR，已关闭 |

本轮代码发现无未修复 ERR/WARN；目标平台验收未完成，不据此合并或发布。Skill 审计重新执行，vendor 0 ERR / 18 WARN、合成示例 0 ERR / 3 WARN，完整 JSON 与上一轮逐字一致，沿用原逐项误报依据。
