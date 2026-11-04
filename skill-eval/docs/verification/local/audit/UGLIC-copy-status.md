## UGLIC 检查 — 文案、状态与长清单

2026-11-04，相对 main `920b186`；按用户授权实现、验证并发布。设计方向保持检索优先的蓝白资料台，DFII 14。

### U — Usability & User Experience

已修复 U1（WARN）：`SkillsPage.tsx`、`SettingsPage.tsx` 的单列信息堆叠和重复说明。最终分列展示，描述/诊断进详情，高频评测、案例、停止、重试仍直接可用。`TasksPage.tsx:CaseResults` 长清单先数量后展开，短清单直接展示；搜索与失败筛选不局限于当前页，390px 四页无文档横向溢出。

已修复 U2（WARN）：停止/失败后仍显示等待结果、执行后将保留产物的未来时提示。`presentation.ts:missingResult/cancelNotice` 与 `TasksPage.tsx` 按执行状态显示恢复信息，不把停止请求当作已经停止，也不宣称不存在的结果已保留。

### G — Grammar

✅ 无未解决问题。31 项前端测试、TypeScript/Vite、Ruff、diff 与公开源码检查通过。原有 TSX/CSS 与原生控件保留，没有新增包或外部素材。

### L — Logic

已修复 L1（ERR）：`TasksPage.tsx` 原先在 current_attempt_id 为空时回退最后一个历史执行；重试已清空当前结论，却继续显示旧摘要和报告。`presentation.ts:taskView` 仅选择当前执行或用户明确选择的历史执行，不能用前一轮替代尚未开始的新执行。回归覆盖旧成功结果/报告不得继承、旧摘要不能借用当前摘要、跨任务失效选择安全回落；浏览器真实重试与历史往返通过。

✅ 停止和重试继续调用原鉴权/幂等 API；操作列显式传入该行任务，点击不冒泡误选其他任务，busy 状态阻止重复提交。分页在过滤后计算并限制当前页；`CaseResults` 按任务/执行重建，避免把另一次执行的筛选当成当前结果。

### I — Integrity

✅ 执行进度、质量结论及结果存在性分开；`ui.tsx:Badge` 与状态筛选共用文案映射。Worker 不再借用评测失败/未完成状态表示撤销/离线。`CaseEditor.tsx` 对不能映射为表单的内容提示源码编辑，不误报为 YAML 语法错误。模型调用、历史只读、导出与未保存边界保留，原报告/用户内容未改。

### C — Containment

✅ 仅前端、相关测试和文档；API、数据库结构、队列、模型调用策略、依赖锁定及 Skill Manage 均未改。合成任务写入、停止与重试只在隔离 QA 数据库中发生，零在线 Worker、零模型调用；主预览只读验证。React 复核无新增副作用或全局可变缓存，CaseResults 的结果索引为局部 Map，旧导航/dirty 防护保留。

### Skill 六模块复核

完整重跑 vendor 与示例，输出与 [vendor-after.json](vendor-after.json)、[example.json](example.json) 完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。原始 code、位置和分类保持；逐项判断沿用 [审计依据](skill-release-audit.md)。运行时文件名、注释规则示例及刻意最小示例有明确依据，不为消除误报修改第三方内容。根应用不是 Agent Skill，N/A。

## 汇总

| 编号 | 原级别 | 结果 |
| --- | --- | --- |
| U1 | WARN | 信息分列、删除重复说明、常用入口直达 |
| U2 | WARN | 停止/失败提示按状态与结果存在性显示 |
| L1 | ERR | 当前执行与历史结果隔离，回归与浏览器验证通过 |

无未解决的实际 ERR/WARN，无待确认修复项。[验收范围与边界](../copy-status-2026-11-04.md)可复核；远程完整检查通过后合 main。
