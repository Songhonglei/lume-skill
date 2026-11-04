## UGLIC 检查 — dev9 工作台交互补齐

日期：2026-11-04。基线为 dev8 / main `37cc002`；检查前端、文档和版本信息。后端接口、数据库 schema、运行依赖与内置 Skill 不变。

### U — Usability & User Experience

已修 U1（WARN）：`static/workspace.js:renderFindings` 为大量问题增加搜索、25 项分页、选择本页及清空操作；分页后将焦点放回可用的分页按钮或搜索框。浏览器使用 31 个真实静态问题验证 25+6 分页、跨页选择和搜索保留。

✅ `findingsPreview` 将库/任务/版本活动中的问题数接到固定版本抽屉；`findingDetail` 在同一窗口逐项查看证据。`static/ui.js:copyText` 提供复制拒绝时的手动回退，避免只显示短暂失败消息。移动布局和边界见 `docs/UI-FOLLOWUP.md`「验证」。

### G — Grammar

✅ 全部静态脚本语法、8 项 Node 原生测试、Ruff 与差异空白检查通过。程序、Compose、锁文件、页头与安装命令版本统一为 0.3.2.dev9。

### L — Logic

✅ `static/ui.js:matchesAuditStatus` 不把执行中或静态得分当成完整通过；概览计数来自搜索/维护范围内的全部已读 Skill，不按分页估算。`filteredFindings` 按字面量搜索，不执行用户提供的正则。`selectFindings` 只添加本页可修复项，待复核项不加入选择；跨分类的选择由主动清空控制。

✅ `findingDetail:paint` 使用代次拒绝迟到的文件响应。`findingsPreview` 在读取结果后校验路由/渲染代次及 Skill 身份，关闭时只恢复仍属于该抽屉的上下文。

### I — Integrity

✅ `static/app.js:route` 显示加载与可重试错误；`pollWorkspace` 连接失败保留原记录，重试连接不重建列表。README、交接及验证记录与本轮范围一致；dev8 的托管 CI 保留为历史证据，dev9 按当前提交独立确认。

### C — Containment

已修 C1（WARN）：异步打开抽屉时，触发按钮可能暂时 disabled，浏览器会把焦点移到 BODY。`static/ui.js:openPanel` 接受显式 opener，`findingsPreview`、行内审计、归属修改及复制回退保留真实触发按钮；实测关闭后焦点返回。

已修 C2（ERR）：会话失效返回登录页时，`static/app.js:showGate` 清理模型草稿、问题查询/选择、历史筛选和版本状态，并关闭已打开弹窗。隔离浏览器通过服务端会话失效后再次请求验证，未保存配置不提交给模型服务。

✅ 只读用户没有选择/修复控件；写操作仍走原有维护者权限、CSRF 和显式授权。上传内容继续安全转义，复制原文不重新解释或执行内容。没有引入内部平台 API、模型收费调用、规则变化、凭据或本机运行数据。

## 汇总

| 项目 | 初检级别 | 处理与复核 |
| --- | --- | --- |
| U1 大列表与分页焦点 | WARN | 已修；31 项实际静态结果和分页/筛选单元测试 |
| C1 异步触发按钮的焦点 | WARN | 已修；显式 opener 与嵌套关闭浏览器验证 |
| C2 会话失效状态残留 | ERR | 已修；真实服务端会话失效后返回登录页验证 |

无未解决 ERR/WARN。独立 Skill GitHub target 的六模块检查另存 `UI-FOLLOWUP-skill-release-audit.json`；frontmatter version 为 GitHub 可选 INFO，不修改冻结 Skill 字节。
