# UGLIC 检查 — 统一分页与详情分层

2026-11-05，相对 main `cbb8e07`。依次检查 U / G / L / I / C，并应用 React 最佳实践清单。

## U — Usability & User Experience

✅ `Pagination.tsx` / `ui.tsx:Dialog`：统一右下角分页与 20/30/50/100 容量，保留空结果状态和有效页边界。普通详情使用抽屉，评测使用大抽屉，加载失败在抽屉内重试；关闭返回原操作焦点与列表。完整案例和报告使用新窗口，不挤占原查询视图。

## G — Grammar

✅ TypeScript/Vite、36 项前端测试、Ruff、59 项后端测试通过。新增文件采用不同词根 `Pagination.tsx` 与 `pageWindow.ts`，避免大小写不敏感文件系统冲突；没有新增依赖。公开源码和 diff 检查见发布记录。

## L — Logic

✅ `task_routes.py:list_tasks`：共享筛选条件用于同一 SQL 快照的总数与数据，不因空页丢失总数；非物化 CTE 允许限量分页，不把全部任务内容先聚合到应用内存。`pageWindow.ts` 处理空结果、末页、结果减少；查询变化、容量变化重置首屏。任务与 Skill 不自动选中第一条并弹出详情。原停止、重试及历史执行隔离行为保留。

## I — Integrity

✅ `SkillsPage.tsx`、`SetsPage.tsx`、`TasksPage.tsx`、`SettingsPage.tsx`、`CaseEditor.tsx` 的所有结果表格和可搜索案例/文件导航使用共享分页。`paginated` 参数默认 false，旧客户端数组返回保留；新对象格式及语义记录于 OPERATIONS.md。加载/失败/0 条/末页、手机布局及新窗口实际回读均有验收证据。

## C — Containment

✅ 报告新窗口仍使用已有后端 sandbox CSP，不放开脚本来源、网络、表单或同源权限；新窗口带 noopener/noreferrer。SQL 所有外部值继续参数化，插入的 filters 为固定源码。鉴权、CSRF、任务提交、版本保护、模型与登录配置未改。写入仅为隔离 QA 合成夹具，主预览不写业务数据。

## Skill 六模块审计

vendor 与 label-text 示例完整重跑，原始机器报告分别对照 [vendor-after.json](vendor-after.json) 与 [example.json](example.json)，两份 JSON 与基线完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。保留 code、位置、分类，沿用[逐项判断依据](skill-release-audit.md)。根应用不是 Agent Skill，N/A；不改第三方文件来消除误报。

## 汇总

| 维度 | 未解决实际 ERR | 未解决实际 WARN |
| --- | --- | --- |
| U / G / L / I / C | 0 | 0 |

无待确认修复项。完整行为证据见[验收记录](../pagination-drawers-2026-11-05.md)。
