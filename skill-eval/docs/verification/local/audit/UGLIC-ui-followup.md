## UGLIC 检查 — 剩余界面建议落地

2026-11-04；相对 main `6fa138b`，仅 `skill-eval/` 前端与文档。按用户默认 UGLIC → Skill 审计 → 修复复核 → GitHub main 流程，沿用本轮修改和发布授权。

### U — Usability & User Experience

已修复 U1（WARN）：`CaseEditor.tsx` 的 saveVersion / fork 原先重建编辑器会回到首案例。现在通过 `EditorView` 与 `SetsPage.tsx` 的 openVersion 携带非首案例、模式、文件及正文位置，挂载时在布局阶段恢复；手动切换清除旧位置。真实保存前后正文 top 为 179.234 / 179.375px；源码模式派生保留文件并聚焦新编辑区。

已修复 U2（WARN）：原低对比辅助标签与菜单焦点处理不足。`style.css` 的执行提示、辅助标签、菜单与焦点规则统一；记录页 13 组抽测为 4.95–6.37:1。`ui.tsx` 的 Dialog / MoreActions 处理安全默认、返回焦点、Esc、外侧关闭。7 次 Tab 仍在原生模态框内，Esc 取消删除后文件保持、焦点回原按钮。

✅ `CaseEditor.tsx` 的 openSource 与 ValidationView 路径按钮让校验错误直达匹配源码。实际缺失脚本失败→定位→修复→重新通过，无隐式修改。`TasksPage.tsx` 的详情和返回列表同时移动焦点，日志请求失败明确展示。

### G — Grammar

✅ 前端 23 项原测试、TypeScript/Vite、Ruff、公开源码扫描、git diff --check、变更文档本地链接与 JSON 检查通过。沿用现有组件和 CSS，没有新增包、字体或运行依赖。

### L — Logic

✅ 视图恢复只用于保存/派生后的目标版本，文件不存在时仍由原案例选择逻辑回退；不沿用其他资源的视图。同步 `useLayoutEffect` 避免首帧先回首案例，正文相对锚点允许提示条/只读横幅高度改变。模态框退出先 close 再恢复连接中的触发元素，元素已移除则转主内容；监听器在卸载清理，未创建新轮询或自动重试。

✅ 按原有预期 edit_number 保存与启用，仍显式确认生成、执行全部冻结案例、手动重试；没有改变判分、附件字节或 YAML 序列化。记录列表全局筛选仍在后端分页前执行，本轮无后端/API 修改。

### I — Integrity

已修复 I1（WARN）：`CaseEditor.tsx` 导出读取服务器快照，但原文案未说明未保存内容不在导出中。现在脏草稿明确显示“导出上次保存的内容”与说明，不为了导出静默保存。结构校验与人工质量复核继续分开，没有自动质量通过标记。

✅ `docs/UI-IMPROVEMENTS.md` 的“原评审建议落地对照”覆盖全部适用项；本轮 [验收收据](../ui-followup-2026-11-04.md)明确真实 CSS 390、640 重排等效测试、桌面截图和抽测边界，不将等效宽度声称为完整缩放/读屏器/WCAG 认证。

### C — Containment

✅ 只改 `skill-eval/`。仅隔离合成草稿产生新版本与校验；旧任务、旧版本及原 Docker 实例未更改，没有调用真实模型。导出、删除和确认原安全语义保持；不发布参考站源码、素材或截图。无正式 Release/GHCR，原生 Linux 验收继续按历史边界。React 复核未发现新增请求瀑布、条件 Hook、共享可变模块状态或未清理监听。

### Skill 六模块复核

vendor 与合成示例完整重跑，JSON 分别与 [vendor-after.json](vendor-after.json)、[example.json](example.json)完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。完整 code、位置和原分类保留在原始 JSON；沿用 [逐项判断依据](skill-release-audit.md)，这些仍是运行时文件名称、示例注释或最小示例的已确认误报，无新增实际问题。根应用不是 Agent Skill，N/A。

## 汇总

| 编号 | 原级别 | 结果 |
| --- | --- | --- |
| U1 | WARN：保存后阅读对象/位置丢失 | 已修复并通过实际浏览器保存与派生验证 |
| U2 | WARN：辅助文字/焦点不足 | 已修复，对比度、模态键盘与返回焦点验证 |
| I1 | WARN：导出快照说明不足 | 已修复，未保存时明确导出范围 |
| G / L / C | 无新增实际问题 | 语法、视图生命周期与范围复核通过 |

无未解决的实际 ERR/WARN。完整 PG、构建与无模型 Compose 启动/重启由远程 CI 执行，成功后合并 main；不能替代真实模型或平台验收。
