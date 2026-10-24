## UGLIC 检查 — GitHub skill-manage 迁入

日期：2026-10-25。目标：`Songhonglei/lume-skill` 根目录 `skill-manage/`。
范围：本地 `10df1ca` 的 83 个受版本管理文件、公开文档修订和合集首页入口；运行代码仍为 `f130611` / 0.3.1 / schema 4。只迁入源码快照，不导入原 Git 历史。依据 glic-check 1.7.0 的 U/G/L/I/C 表执行迁入差异审查；内置 Skill 与 P4 已审版本逐字节一致，重新运行 GitHub 目标发布审计。

### U — Usability & User Experience

已修 U1（WARN）：原交接文档没有 clone 地址，会误导异机 Agent。合集根 `README.md` 新增 Skill Manage 入口；项目 `README.md`“获取源码”提供实际 clone 地址，说明安装、开发、Compose 命令先进入 `skill-manage/`。`docs/HANDOFF.md` 第 10–12 节同步接手位置、原机器附录缺省及发布授权边界。

### G — Grammar

✅ 新目录中 ruff check、ruff format（40 文件）、Node 语法检查通过；80 项 pytest 通过。`examples/repair-demo/scripts/greet.py` 是故意保留的受审负样例，不执行或修正它以消除检查错误。

INFO / 保留依据：普通 `git diff --cached --check` 对内置 Skill 的 `LICENSE:22`、`references/check-rules.md:1347`、`references/controlled-domains.md:40` 报文件尾空行。这三处与上游/本地基线字节一致，无内容或执行影响；为保持来源完整保留。使用 `git -c core.whitespace=-blank-at-eof diff --cached --check` 复核其余空白问题，通过。

### L — Logic

✅ `src/`、`tests/`、`examples/` 与基线逐字节一致；包配置、锁文件、Compose、Dockerfile、迁移、许可证保持原样，项目内相对路径不变。独立非 editable wheel 安装通过 7 组 smoke：setup 幂等、start 幂等、静态资源/API/上传下载、内置 worker 真实静态审计、外接 worker 独立存储/审计/重启、备份恢复、同端口停机重启。

### I — Integrity

已修 I1（ERR）：`docs/AUDIT-CAPABILITY-MAP.md`“来源”含个人绝对路径且明确要求公开前替换。改为来源说明，保留候选版本/摘要与公开上游链接；`docs/PLAN.md` 同步清理个人机器路径。

已修 I2（WARN）：`HANDOFF.md`、`OPERATIONS.md`、`VALIDATION.md`、`SOURCES.md` 仍描述没有远端/未公开源码。现区分历史验收与 GitHub 迁入；本项目专用 CI、公共包、镜像仍未配置，合集现有 Skill Eval CI 不覆盖本项目。短提交号明确属于迁入前历史，不能在此直接 checkout。

✅ 83 个源文件完整迁入，76 个逐字节相同，7 个仅修改公开文档。另加本轮审查和发布审计 JSON。历史 0.3.1 发行物不被替换或上传；本轮构建只用于安装检查，不冒充原验收摘要对应的发行物。

### C — Containment

✅ 使用 `git archive` 提取已跟踪快照，不复制 `.git/`、`.local/`、`.venv/`、数据库、配置、凭据、备份、日志、截图及既有 dist。仅新增 `skill-manage/` 和首页入口，保留最新 main 的 Skill Eval 调整。MIT、UPSTREAM、README、CHANGELOG 保持完整。

既有真实问题（本轮未修复）：`docs/HANDOFF.md` T01 的目标文件脱敏覆盖不足。项目 README 在安装前提示；扩大到敏感真实包前应优先处理。迁入通过不等于重新完成整个平台安全审计，也不改变审计、独立复审和发布门禁。

## 本轮验证

- `uv sync --locked --extra dev`：在迁入目录的新环境完成。
- `pytest -q`：80 passed；1 条 TestClient/httpx 依赖弃用提示。
- `ruff check src tests`、`ruff format --check src tests`、`node --check src/skill_mng/static/app.js`：通过。
- `uv build --offline --out-dir .local/github-sync`：sdist + wheel 成功；新建隔离环境安装 wheel，`tests/smoke_wheel.py` 7 组通过。
- 86 个暂存文件范围正确；相对文件引用无断链，常见凭据模式扫描无匹配；wheel 的 44 个应用文件与源码逐字节一致，sdist 不含 ignored 目录。构建结果只作验证，不提交或公开发布。
- 未重跑收费模型或 Compose 全链路；历史真实模型与 Linux 结果见 `docs/VALIDATION.md`。

## skill-release-audit 完整结果

机器完整输出：[GITHUB-SYNC-skill-release-audit.json](GITHUB-SYNC-skill-release-audit.json)。检查目标为内置 `src/skill_mng/resources/skills/skill-deep-audit/`，没有把整个应用或负样例当作待发布 Skill。

| 模块 | 结果 | 全部发现 |
| --- | --- | --- |
| 1 语法与逻辑 | PASS | 无 |
| 2 功能完整性 | PASS | 无 |
| 3 边界与异常处理 | PASS | 无 |
| 4 数据与配置安全 | PASS | 无 |
| 5 依赖检查 | PASS | 无 |
| 6 文档规范 | PASS | INFO，`code=""`，`file=SKILL.md`，`line=null`：frontmatter 缺少 version；部分私有 SkillHub 要求该字段。GitHub 目标不要求，正文已有 1.2.0-platform.1，保留当前格式。 |

**六模块 PASS，0 ERR、0 WARN、1 INFO。** README/CHANGELOG 是 fork 的来源与分发说明，保留依据同 `P4-UGLIC.md`。

## 汇总

| 编号 | 维度 | 问题 | 级别 / 状态 |
| --- | --- | --- | --- |
| U1 | 可用性 | 缺迁入仓库与目录指引 | WARN / 已修复并复核 |
| I1 | 完整性 | 公开文档中的个人绝对路径 | ERR / 已修复并复核 |
| I2 | 完整性 | 迁入后的公开源码状态过时 | WARN / 已修复并复核 |
| version 字段 | 发布审计 | GitHub 不要求，正文版本明确 | INFO / 非阻断 |
| T01 | 原应用待办 | 目标内容脱敏覆盖不足 | 真实未修复问题；本轮迁入差异范围外，保留披露 |

**本次迁入差异无未解决 ERR/WARN。** T01–T09 继续按 HANDOFF 的验收要求推进；不将既有风险改写为误报或已修复。
