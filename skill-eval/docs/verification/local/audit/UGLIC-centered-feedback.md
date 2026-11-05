# UGLIC 检查 — 居中提示与就近校验

2026-11-05，相对 main `d7b1f8f`。按 U / G / L / I / C 检查本次前端修改，并应用 React 最佳实践清单。

## U — Usability & User Experience

✅ `Toast.tsx`：消息在视口中心显示，成功与失败均可关闭且 3 秒消失；Popover 位于顶层，挂在当前 modal 内避免 inert，保留操作焦点。`SkillsPage.tsx` / `SetImportDialog.tsx` / `SettingsPage.tsx` / `TaskDialog.tsx` / `CaseEditor.tsx` / `App.tsx:Login` 将输入校验放回相关组件，新增版本错误不再藏在抽屉后。

## G — Grammar

✅ 38 项前端测试与 TypeScript/Vite 通过，沿用现有 React、ReactDOM 和 CSS，无新增依赖。`api.ts:validationIssue` 保留原始中文格式错误，结构化边界错误转为简洁提示，未知操作错误仍有恢复说明。

## L — Logic

✅ `App.tsx`：每条提示独立标识，旧计时器只清理自身消息，连续操作重新计时。`Toast.tsx`：打开/关闭 modal 的观察器和 Popover 都在卸载时清理。任务 422 拒绝可修正参数后重试；网络未知结果继续保留原请求内容与标识，幂等行为不变。

## I — Integrity

✅ 所有 `notify` 调用共用反馈入口；接入指令生成、导入/编辑和任务提交的非格式操作失败同步迁移。格式错误不自动隐藏；持续状态与加载失败保留原位置和重试入口。覆盖桌面、手机、成功/失败、手工关闭、叠层切换与连续操作，证据见[走查记录](../centered-feedback-2026-11-05.md)。

## C — Containment

✅ 后端、鉴权、CSRF、请求协议、版本与判分不变，原始报告和用户内容不改。没有修改真实账号或模型配置，没有调用模型。QA 操作没有成功创建业务资源；原剪贴板、网络和视口已恢复。仅发布 Skill Eval 前端及说明，不修改 skill-manage 或第三方实现。

## Skill 六模块审计

vendor 与示例重新运行并对照 [vendor-after.json](vendor-after.json) 和 [example.json](example.json)。两份 JSON 与基线完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。保留原始 finding code、位置与分类，沿用[逐项判断依据](skill-release-audit.md)，不通过修改第三方代码清除误报。根应用不是 Agent Skill，N/A。

## 汇总

| 维度 | 未解决实际 ERR | 未解决实际 WARN |
| --- | --- | --- |
| U / G / L / I / C | 0 | 0 |

无待确认修复项。检查通过后同步 GitHub，CI 通过后合入 main。
