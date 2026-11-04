## UGLIC 检查 — 可搜索评测集目录与独立详情

2026-11-04；相对 main `2d93d93`。采用 frontend-design“检索优先的蓝白资料台”，DFII 14；当前用户授权包括实现、验证和按默认流程发布。本轮仅 Skill Eval 前端与相关文档，不修改 Skill Manage。

### U — Usability & User Experience

✅ `SetsPage.tsx` 目录只负责检索与进入详情，每页 20 行；`setDirectory.ts` 在全部资源中过滤后分页。126 个合成 Skill 中可直接找到列表末尾的 Skill，未准备案例的资源同样可搜。`SkillSearch.tsx` 支持名称/描述检索、键盘、明确所选对象与空结果；从 Skill 002 改搜 125 后导入正确归属。

已修复 U1（WARN）：单元格的名称、描述、默认标记、案例数堆叠。最终目录仅 Skill、评测集、启用版本、草稿数各一值，实际 `td small` 为 0；额外信息收进“评测集信息”。长名保留完整 title，常用按钮保持可见。

✅ 目录不渲染编辑器；`#sets/<id>/history` 不渲染案例正文，详情才维护单个集。指南和结构校验通过按需 Dialog 打开；缺脚本实测从问题定位到源码、修复后通过，焦点正确，不增加强制核对或自动质量通过标记。390px 四种视图没有文档横向溢出。

### G — Grammar

✅ 27 项前端测试、TypeScript/Vite、Ruff、git diff --check、公开源码与上游摘要、变更文档链接/围栏/JSON 检查通过。无新增包、字体或外部素材；沿用项目 TSX 和原生控件。

### L — Logic

已修复 L1（ERR）：新深链接若只按 version UUID 读取，可能让另一集的版本显示在当前标题下。`SetsPage.tsx:35` 先检查所选版本属于 detail.versions，再请求文件，渲染时复核 set_id。实际将另一集的合法版本 UUID 拼入当前集链接时显示归属错误、编辑器数量为 0；没有写入任何错误归属的数据。

已修复 L2（WARN）：成功保存/导入的结果跳转可能被尚未解除的“保存中”保护误拦。`useWorkspaceNavigation.ts` 明确区分已完成写入的结果导航与用户主动导航；仅 `SetsPage.tsx` 的保存结果、导入成功两个回调使用 saved 标记，且均在成功响应后。没有依赖延迟轮询或定时猜测。实际 ZIP 导入、保存启用与派生后都进入正确版本。

✅ 用户导航继续受 dirty/busy 保护；浏览器返回会先恢复当前位置再询问，取消保留输入，确认放弃才离开；管理的历史索引按会话区分，未知历史条目不用于相对跳转。Skip link 直接聚焦主内容，不增加无关历史条目。已有 beforeunload、手动重试和任务幂等保留。

### I — Integrity

✅ `workspaceRoute.ts` 区分 Skill 版本与 setVersionId，校验 UUID，支持目录/指定版本/历史/导入入口；指定链接刷新和前进后退通过。无显式版本的详情仍按约定显示当前最新草稿/启用版本，不能将这种动态入口误称为冻结旧版本。

✅ `SetImportDialog.tsx` 仍沿用原 ZIP/JSON/目录预览与草稿写入协议；源 Skill 版本、未知字段、附件和判分未改。`TasksPage.tsx` 的生成结果入口带 summary.draft_id，进入对应草稿；旧草稿归档后按只读查看。读取失败保留已有目录和编辑数据，实际停止本轮 QA API、恢复重试后行与会话保持。

✅ 设计、运维路由、进度及交接入口已同步；旧布局明确为历史，未改写旧候选包/原模型验收。源码与模型实际身份等历史边界保持。

### C — Containment

✅ 没有后端接口、数据库、锁文件、工具版本或模型调用策略改动。所有业务读写仍走原 API/鉴权/CSRF；初次关联由用户明确选择，跨集链接不能编辑。独立 QA 保留 126 Skills、0 Worker、0 任务；原四 Skill 预览不混入批量数据，原 Docker 实例不变。

✅ 没有新增全局缓存、后台任务或外部请求。React 复核：清理 popstate/忙碌监听，过期请求仍由 useData 中止；Skill 搜索不因父项清空而清掉新输入；目录 Map 自建数组，不修改 API 原对象。新页面主请求共享原数据 Hook，只有版本归属确认后才读取该版本文件。

### Skill 六模块复核

vendor 与示例完整重跑，JSON 分别与 [vendor-after.json](vendor-after.json)、[example.json](example.json) 完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。原始 code、位置及分类保留，沿用 [逐项判断依据](skill-release-audit.md)；运行时文件名、示例注释及刻意最小示例的误报不改坏有效实现，无新增实际问题。根应用不是 Agent Skill，N/A。

## 汇总

| 编号 | 原级别 | 结果 |
| --- | --- | --- |
| U1 | WARN：列表同列信息过多 | 已按用户补充要求改为一列一值，额外属性移入详情 |
| L1 | ERR：深链版本归属可能不符 | 已修复，负例阻止渲染错误编辑器 |
| L2 | WARN：结果跳转被保存保护误拦 | 已修复，真实导入/保存/派生验证 |
| G / I / C | 无新增实际问题 | 语法、路由、文档、数据边界复核通过 |

无未解决的实际 ERR/WARN。[完整验收](../set-directory-2026-11-04.md)与[机器摘要](../set-directory-2026-11-04.json)可复核；远程完整 PG/无模型容器 CI 成功后合 main，不作为新的模型或平台验收。
