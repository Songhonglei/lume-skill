## UGLIC 检查 — dev8 工作台同步 GitHub

日期：2026-11-04。基线：lume-skill main 04957ff；范围为 skill-manage 页面、只读摘要、文档与专用 CI。保持蓝色主题、schema 4、审计规则和独立复审门禁。复核含本轮已完成的浏览器与安装包证据；托管 CI 按本次提交另外确认。

### U — Usability & User Experience

✅ `docs/UI-IMPROVEMENTS.md`「验证」和 `docs/evidence/UI-BROWSER-2026-11-04.json` 记录桌面/390px 布局、错误恢复、版本选择、抽屉焦点、导入及主动更新。合成 drop 与原生系统拖放区别保留；没有把静态执行称为语义通过。

### G — Grammar

✅ 静态脚本语法、Node 原生测试、Ruff 和差异空白检查纳入 `.github/workflows/skill-manage-checks.yml`「JavaScript syntax and UI safety tests」。沿用原技术栈和锁定依赖，不引入框架或在线资源。

### L — Logic

✅ `workspace.py:latest_audits` 按版本选择最后登记的审计；`history.py:task_history` 的统计覆盖完整筛选快照，游标绑定版本范围。`tests/test_workspace.py` 覆盖其他版本干扰、摘要无报告正文、固定查询数、分页和权限。

### I — Integrity

✅ `execution_api.py:report` 为无独立任务的复审报告提供版本身份；`static/workspace.js:auditReportDetail` 可读冻结报告。README、交接、验证和 API 契约同步更新；旧失败和历史验收回执保持原样。

### C — Containment

已修 C1（ERR）：`static/app.js:showGate` 现在调用 `static/ui.js:clearSessionView`，登录过期返回登录页和显式退出都清空未保存模型草稿及页面选择，防止后续登录者继承上一会话输入；同时递增渲染代次，使旧请求失效。`tests/test_ui.cjs`「leaving a session」覆盖合成凭据、筛选和选择清理。

✅ `static/ui.js:renderMarkdown` 转义 HTML、阻断执行式链接与远程图片请求，阅读渲染限制 250000 字符；原文及下载保持完整。仅同步源代码、公开文档及去敏证据；不包含本机配置、数据库、凭据或预览日志。内置 Skill 字节未变。

## 汇总

| 项目 | 初检级别 | 处理与复核 |
| --- | --- | --- |
| C1 会话失效残留草稿 | ERR | 已修；5 项 Node 测试通过，登录页与退出共享清理入口 |
| 版本与语义边界 | 检查项 | 固定版本摘要、静态结论和完整复审分开 |
| 跨机器 HTTPS / 真实模型 | 验收边界 | 本次不新增此类结论，原待办保持 |

合集目录完整 pytest 为 183 passed；5 项 Node 测试、Ruff、全部静态脚本语法与差异检查通过。

无未解决 ERR/WARN。GitHub target 的独立 Skill 六模块审计结果见 `UI-GITHUB-skill-release-audit.json`；frontmatter version 提示为 INFO，GitHub 不要求，未为消除提示改写内置 Skill。
