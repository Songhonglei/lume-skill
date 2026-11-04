## UGLIC 检查 — Skill Eval 工作台改进

2026-11-04；范围为相对 main `37cc002` 的 `skill-eval/` 改动。按用户默认流程使用 UGLIC 五维检查及 skill-release-audit，已获本轮修改、修复和源码发布授权。

### U — Usability & User Experience

✅ 案例编辑从双重侧栏简化为顶部选择器与单案例导航；`frontend/src/CaseEditor.tsx:110` 保存条突出主操作，审查指南折叠。`SettingsPage.tsx:30` 配置按前提顺序组织。最终桌面截图已逐页核对，小屏通过 390px DOM 布局和控件检查。

已修复 U1（WARN）：读取中曾显示空状态、断连丢失可读上下文。`frontend/src/ui.tsx:6` 现在区分路径、初次加载、后台刷新与错误，保留已读数据；真实停止本轮 API、恢复验证通过。`SkillsPage.tsx:76` 补齐版本详情失败与重试，避免主操作不可用但无解释。

### G — Grammar

✅ Ruff、前端测试、TypeScript、生产构建、git diff --check、JSON、文档本地链接与围栏检查通过。维持项目既有 TSX 组织和 CSS，不新增 UI 库或字体。

### L — Logic

已修复 L1（ERR）：快速保存可收到上一请求 200 后紧接着 404，原因是数据库依赖在 HTTP 响应后才提交。`backend/auth_routes.py:26` 及其余数据库依赖统一 `scope="function"`；`backend/common.py:25` 标明生命周期。`tests/test_response_commit.py` 在 response.start 独立查询验证先红后绿；不是仅断言实现选项。最低 FastAPI 与已锁定 0.161.1 对齐，锁包版本未升级。

✅ `backend/task_routes.py` 的 list_tasks 将全部条件置于 LIMIT/OFFSET 之前；时间为左闭右开，带时区且严格校验。`tests/test_queue.py:239` 覆盖跨页记录与结论区别。`frontend/src/TasksPage.tsx:25` 改变筛选后重置页码、详情与 attempt；浏览器核对匹配详情及空结果。手动重试幂等键、离线队列、模型调用确认和全量冻结案例沿用。

### I — Integrity

✅ 草稿保存、启用快照、派生草稿浏览器验证完成；YAML 映射、未知字段、附件字节和判分逻辑未修改，23 项原有前端测试通过。新 API 参数及日期本地时区映射已写入 `docs/OPERATIONS.md` 的“评测记录筛选”。设计、进度与交接索引增加本轮入口，并明确旧候选包不含新版界面。

✅ React 复核：没有新增依赖瀑布、循环 effect、匿名内嵌组件或全局共享可变请求状态；轮询不重叠，过期请求会 abort；异步选择先捕获值，确认 Promise 在卸载时取消，Dialog 有可访问标题并聚焦保留操作。

### C — Containment

✅ 仅 `skill-eval/`，不改动 skill-manage。参数化查询、管理员认证和 CSRF 保持；不新增凭据输出。函数依赖退出前已读完下载/报告字节，没有依赖已关闭连接继续流式访问。公开源码与上游摘要核对通过，只公开合成应用截图，不公开参考界面、登录或运行资料。不触发真实模型、旧 Docker 环境、Release 或 GHCR。

### Skill 审计复核

六模块重新执行后，vendor JSON 与 [vendor-after.json](vendor-after.json) 完全一致：0 ERR / 18 机器 WARN；合成示例与 [example.json](example.json) 完全一致：0 ERR / 3 机器 WARN。完整逐项记录保留 code、位置、分类；沿用 [skill-release-audit.md](skill-release-audit.md) 的运行时文件名、注释 TODO 示例及最小合成 Skill 判断依据，无新增实际缺陷。应用根目录不是 Skill，N/A；不伪造 SKILL.md 或关闭检查。

## 汇总

| 编号 | 原级别 | 结果 |
| --- | --- | --- |
| U1 | WARN：加载、失败与空结果混淆 | 已修复，断连恢复与详情重试验证 |
| L1 | ERR：成功响应早于事务提交 | 已修复，回归先失败后通过，59 后端测试通过 |
| G / I / C | 无新增实际问题 | 自动检查、文档与边界复核通过 |

无未解决的实际 ERR/WARN。完整证据见[本轮收据](../ui-refinement-2026-11-04.md)。远程 CI 随 PR 执行，成功后再合 main；CI 的无模型 Docker 引导不能替代目标平台真实模型验收。
