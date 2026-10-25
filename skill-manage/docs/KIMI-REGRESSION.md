# K2.8 真实回归与修复验收

日期：2026-10-25。当前开发版本 0.3.2.dev4，schema 4。用户授权 K2.8 Preview，模型 ID `kimi-for-coding`，后续批次显式设置 `reasoning_effort=low`。使用真实本机 CLI、Web/API、SQLite、worker 与供应商模型；未执行目标脚本，未推送或发布。

## 已验证结果

| 批次 | 源码 | 结果 | 含能力检测的调用数 | 回执 |
| --- | --- | --- | --- | --- |
| 完整 14 例 | `7eb8571` / dev3 | 13 自动预期匹配、1 人工待复核；0 审计执行失败、0 预期差异、0 预算跳过；两次修复需关注 | 38 | [完整回执](../regression/baselines/kimi-k28-before-context-fix-2026-10-25.json) |
| 两类修复重验 | `65aeac3` / dev4 | 2 审计匹配、2 修复通过，无未决或跳过 | 11 | [修复回执](../regression/baselines/kimi-k28-repairs-2026-10-25.json) |
| dev4 静态 14 例 | `65aeac3` | 14 预期匹配，仅静态证据 | 0 | [静态回执](../regression/baselines/static-dev4-2026-10-25.json) |

语法修复使用审计 1 次、编辑及独立复审 3 次；description 修复使用审计 1 次、编辑及独立复审 4 次。两次均为 1 轮、完整复审 117/117、`semanticCompleted=true`、`scopeSatisfied=true`，无需复核后登记新版本。候选双摘要、下载报告摘要、原包保持、current 保持及重复登记幂等断言均通过。

完整 14 例是 dev3 的实际报告；dev4 重验只针对受影响的两类修复，不将不同源码批次拼成一次运行。公开 `webapp-testing` 仍待实际人工裁定；真实回执均为 `humanReview=pending`。固定预期中已标注规则的误报/漏报计数均为 0，不推算为全规则或真实世界准确率。

## 定位并修复的问题

原始 `authorization` 对象放在一行 JSON 模型消息中，被通用凭据脱敏误认为字面值赋值，遮掉后续 SKILL.md 和引用证据。模型明确返回没有证据，门禁因此拦截，两次旧修复均为 `needs_attention`。dev4 只将模型消息标签改为 `editScope`，system 标签改为 Frozen edit scope。平台冻结授权、候选授权路径、通用脱敏、目标凭据整包阻断、评分和发布门禁保持原样。

协议测试现在解析实际经服务端脱敏的请求，核对完整授权、入口和引用内容；旧代码失败，修正后通过。全套 168 项测试通过，ruff check/format、JS 语法和 Git 空白检查通过。另补齐思考字段受限回传、管理员可选思考程度、自动工具选择但严格校验能力、截断输出稳定错误，以及失败修复的冻结报告和 diff 保存。协议依据见 [Kimi 思考模型](https://platform.kimi.ai/docs/guide/use-thinking-models)与 [Kimi Code 模型配置](https://www.kimi.com/en/help/kimi-code/models)。

## 预算及历史

[调用台账](evidence/KIMI-CALL-LEDGER-2026-10-25.json)记录保守占用 **159/256**，剩余 **97**。旧批次在未收敛复审期间由 Agent 中断，未核实最终在途费用，因此保留整个 96 次任务预留；不把该数当作供应商实际计费。三个已观测完成的诊断和一个明确停在首响应校验的能力批次核回共 4 次预留。

[历史原始回执和诊断](evidence/KIMI-ATTEMPTS-2026-10-25.json)保留 K2.7 订阅权限 403、K2.8 指定工具与思考模式冲突 400、未真正调用工具的能力拒绝及 Agent 中断批次；旧失败和未决复审未删除或改写。最初 256 次授权只分配一次，跨进程累计。密钥原文件未修改，私有配置只在 ignored `.local/` 下且权限 600，不进入证据、仓库、分发物或 worker。

## T04 证据与边界

源码 `65aeac3` 的 dev4 wheel/sdist 在干净工作树构建。[字节比对清单](evidence/DEV4-DISTRIBUTION-2026-10-25.json)确认 49 个应用文件、107 个源文件、版本、运行依赖、许可与运行数据排除；[新 venv 实际 wheel 烟测](evidence/DEV4-WHEEL-SMOKE-2026-10-25.json)的 7 组全部通过。清单固定报告文档新增前的源码提交，不冒充当前文档提交的 sdist。后续带报告文档的构建清单另存本机 ignored 输出。

GitHub Actions 矩阵仍未触发，不声称 Ubuntu/macOS 托管 runner 已通过。精确源码提交及应用逐文件摘要见 [完整批次来源](evidence/KIMI-BASELINE-SOURCE-2026-10-25.json)、[修复重验来源](evidence/KIMI-REPAIR-SOURCE-2026-10-25.json)；修复来源另外确认隐私、报告验收与规则文件字节未变。
