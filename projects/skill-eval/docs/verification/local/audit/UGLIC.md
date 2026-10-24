# UGLIC 检查 — 本机开发候选

2026-10-24。范围：本项目应用源码、配置、文档、独立 Worker 包和本机验证记录；按用户已确认的默认流程修复实际问题并复核。容器和公开发布是尚未放行的独立范围。

## U — 可用性

已修复：

- U1：README 仍声称“尚未开发”，缺少实际启动前提与错误恢复路径。已按真实本机命令重写 README，并增加 OPERATIONS.md、WORKER.md。
- U2：新保存版本在评测集列表刷新前被重新选回旧草稿。`frontend/src/SetsPage.tsx:34` 只在尚未选择版本时选默认值；`CaseEditor.tsx:34` 同步归档状态，保存版本保持不可变。此前浏览器已定位问题，修正后生产构建通过；最后一轮浏览器复核状态单独记录。
- U3：evals.json 导入 notes 为对象，界面曾按字符串直接渲染。`frontend/src/SetsPage.tsx:8` 与导入预览改为显示 path/message，保留转换说明。
- U4：跨页后 Skill 数据可能仍停留在生成前状态。`frontend/src/App.tsx:66` 导航时刷新；不会把已有草稿再次当成无案例。

- U5：`backend/task_routes.py:96` 与 `frontend/src/TasksPage.tsx` 的历史记录默认只返回有限条数，页面搜索也只覆盖已加载记录。现已增加服务端搜索与分页，旧任务继续可查，相关 PG 测试通过。

## G — 语法与配置

Python Ruff、38 项测试、TypeScript 和 Vite 生产构建通过。YAML/JSON 候选配置可解析；Docker Compose 引擎检查和远程工作流执行尚未运行。

没有为让检查器通过而向项目根目录补造 SKILL.md，或修改有效的上游模板与合成业务行为。

## L — 逻辑

已修复：

- L1：确认窗口到提交之间，模型或启用案例版本可能改变。`backend/task_routes.py:48`、`:63` 校验预期配置 ID；同幂等键查回仍优先返回原任务。新测试覆盖冲突。
- L2：事件序号存在空洞时不应提前确认后续进度。`backend/worker_routes.py` 的 upload_events 要求新序号连续，原内容重复提交仍幂等；测试覆盖断档、重复与查询。
- L3：heartbeat 参数虽已暴露，Worker 原来固定使用 10 秒。`worker/runtime.py:121` 使用中心给出的间隔，`backend/config.py:30` 保证心跳与租约关系合法。

原始报告每个冻结案例必须有一致的有效断言；空结果、跳过、缺失/重复案例、CLI 异常或源摘要不符均不能整体通过。两个 Worker 竞争、取消与完成竞争、过期回执不覆盖新 attempt 已用隔离 PG 测试；模型执行和语义裁判另有真实证据。

- L4：`worker/runtime.py:79` 的最后一批已有待确认事件时，确认后可能提前停止读取后续日志。`worker/runtime.py` 的 flush_events 继续排空已完成日志，新增回归测试覆盖先确认旧批次再补发后续事件。

## I — 完整性

已修复：

- I1：上游 SKILL.md 引用的 install、observations、migrate-anthropic、cli 四份参考没有一并保留。已从同一固定提交补齐原文，并把摘要加入 `vendor/skill-upper/UPSTREAM.json`。产品仍只调用案例编写流程。
- I2：第三方声明与网页分发许可不完整。增加 THIRD-PARTY-NOTICES.md、licenses/、网页第三方许可文本及 Python 依赖元数据清单；Worker 源码 ZIP 与安装目录保留许可。
- I3：备份恢复缺少可执行路径和证据。增加 `deploy/volume_backup.py`，实际恢复到新库和新目录；会话、资源、报告与文件摘要保持，测试覆盖覆盖保护和损坏摘要。
- I4：独立 Worker 源码包现在含平台清单、安装说明、固定依赖与工具摘要；macOS 安装实际运行，Linux 只产出候选，不宣称通过。

## C — 范围与副作用

已修复：

- C1：显式传入不存在的 skill-up 路径不应悄悄换用另一路径。`worker/__main__.py:36` 给出明确错误。
- C2：不支持的 ZIP 压缩方法应按无效包处理。`backend/storage.py:113` 收敛异常；不执行上传脚本、不写解包目录外。
- C3：移除未使用的 cryptography 运行依赖。当前模型登录由 Worker 专用存储管理，中心不接收原始模型密钥，不虚构中心加密保管能力。

- C4：`.dockerignore` 补齐 backups 与已知运行凭据文件，`deploy/build_worker.py` 从固定资产清单取文件并拒绝源文件符号链接，避免把新增运行文件捎进安装包。重打包摘要与最终安装实测的 ZIP 一致。

公开候选扫描未发现个人绝对路径、内部域名、运行凭据或私有数据文件；vendor 全量摘要与固定版本一致。环境与凭据仅按白名单进入模型进程；报告 iframe 无同源权限，CSP 禁止网络与提交。隔离仍按单管理员信任模型说明，不宣称多租户强隔离。

## 汇总

| 结果 | 说明 |
| --- | --- |
| 已修复并复核 | 上述实际源码、文档与资产缺失问题；相关单测/构建/包校验通过 |
| 当前本机源码阻断缺陷 | 未发现；最后的浏览器复核与平台验收单独列出，不用构建替代 |
| 误报 | 见 skill-release-audit.md，保留原始 JSON，不计入实际 WARN |
| 公开发布阻断 | Linux/Compose 实测、公开仓库、项目最终许可证、远程 CI、发布后安装尚未完成 |

结论：可以交付本机开发候选，不能据此公开发布或合入远程 main。验收分项见 ../acceptance.md。
