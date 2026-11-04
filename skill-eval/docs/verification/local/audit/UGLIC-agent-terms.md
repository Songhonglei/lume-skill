## UGLIC 检查 — 页面 Agent 术语走查

2026-11-04，相对 main `70df00b`。用户要求检查所有写死的 Codex 页面文案，统一 Agent 称呼。

### U — Usability & User Experience

已修复 U1（WARN）：只改安装助手说明，配置步骤、表头、连接选择、运行环境、Worker 详情和语义裁判仍显示固定产品名。`SettingsPage.tsx`、`CaseEditor.tsx`、`workerSetup.ts` 统一为登录 Agent、Agent 连接、Agent CLI、Agent 语义裁判；后台及 Worker 新生成的连接/登录/校验/失败提示同步。文案按上下文区分动作、对象和工具，不把所有字段机械替换成登录动作。

### G — Grammar

✅ 59 项后端测试、34 项前端测试、TypeScript/Vite、Ruff、公开源码和 diff 检查通过。没有新增依赖或测试框架，没有为文字替换增加镜像实现的测试。

### L — Logic

✅ 业务条件、API 字段、鉴权、连接指纹、执行引擎枚举和固定版本未改。`presentation.ts:agentConnectionLabel` 仅将旧系统默认名 Codex / Codex 登录及空值显示为 Agent 登录，自定义连接名保持原值，不写回数据库。后台和 Worker 变更仅提示及默认展示名称。

### I — Integrity

✅ 对用户可见术语、前后端错误、安装指令及 Worker 文档分别核对。实际 `codex` 可执行文件、--install-codex、--codex-home、CODEX_HOME 和配置字段保留，避免指令失效；引擎配置错误仍说明实际允许的 `codex` 枚举。原始报告、存储的历史诊断和第三方内容不替换，本轮不增加其他执行引擎支持。

### C — Containment

✅ 修改限制在 Skill Eval 文案及默认显示名，不改模型/密码/登录配置、数据库结构、原始任务或判分行为。为加载服务端文案重启本地预览，沿用原 OSE 设置、数据库和文件目录；重载后现有会话继续有效，没有注册 Worker、生成接入码或调用模型。

### 页面核对

浏览器实际回读配置步骤为“登录 Agent”，Worker 列为“Agent 登录”，模型表单为“Agent 连接”；默认配置页正文无 Codex。运行环境和 Worker 详情显示 Agent CLI，安装提示词正文无 Codex 品牌词并保留真实安装参数。语义裁判选项按源码检查更新；此次未更改裁判选择或保存案例。预览使用本次生产构建，蓝白样式及原交互保留。

### Skill 六模块复核

完整重跑 vendor 与示例，与 [vendor-after.json](vendor-after.json)、[example.json](example.json) 完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。原始 code、位置及分类保留，沿用[逐项判断依据](skill-release-audit.md)，不修改第三方文件清除误报。根应用非 Agent Skill，N/A。

## 汇总

| 编号 | 原级别 | 结果 |
| --- | --- | --- |
| U1 | WARN | 页面、提示词及新系统提示已统一 Agent 称呼 |

无未解决的实际 ERR/WARN，无待确认修复项。发布前检查通过后推送并合 main；本轮不增加新模型或新机器验收结论。
