# ChatGPT Pro 登录的 Docker Worker 真实模型验收

日期：2026-10-25（Asia/Shanghai）。本地未提交改动；未运行本轮远端 CI、推送或正式发布。完整脱敏收据见 [pro-docker-e2e-2026-10-25.json](pro-docker-e2e-2026-10-25.json)。

## 结论与平台边界

当前 Docker Desktop 原生 Linux aarch64 Worker 已完成真实模型连接、三类裁判、案例生成、草稿维护、保存启用、同版本复用、错误 Skill 反例，以及配套备份恢复。登录采用用户亲自授权的 Codex Sign in with ChatGPT，复用其 Pro 订阅；不再依赖先前受限的 Harness 模型通道。

这是 ARM64 Docker 路径的本地证据。原生 Linux x86_64 仍未实测，先前 amd64 模拟环境的 seccomp EINVAL 也没有因此解除；Podman 和其他宿主内核不能据此宣称通过。正式版本、公开镜像和其他未测验收分支保持待完成。

## 环境与登录隔离

- Docker Desktop 4.96.3、Engine 29.9.2；原生 Linux aarch64、UID 10001；skill-up 0.14.0、Codex CLI 0.162.1。
- 固定有限 seccomp、cap-drop ALL、no-new-privileges，实测 CapEff 0、NoNewPrivs 1、Seccomp 2；工作区沙箱检查通过。未使用特权、SYS_ADMIN 或关闭 Codex 沙箱。
- 用户在官方设备登录页面亲自授权。原始登录只保存在专用 model-home 命名卷，auth.json 权限 0600；没有读取、复制或改动宿主 Codex 登录，没有挂宿主 HOME 或 Docker socket。
- 本次请求模型为 `gpt-6-luna`；服务端实际模型身份没有独立核实，收据保留 actual_model 为 null。真实 Worker.probe 成功返回 CONNECTION_OK。
- 本轮通过真实中心 HTTP API 发起和观察任务，浏览器交互测试未重复；此前编辑器浏览器证据保持原边界。

## 七个真实任务

所有任务均只有一个 attempt。报告 ZIP 均从中心重新下载并核对 SHA256，Skill 冻结源摘要在执行前后相同。

| 阶段 | 执行状态 / 结果 |
| --- | --- |
| 自带案例的三类裁判 | SUCCEEDED，3/3 通过；rule_based、script、agent_judge 各一个 |
| 无案例 Skill 的真实生成 | SUCCEEDED，目标 3 个、实际 3 个；中文案例，全量校验通过 |
| 生成草稿保存启用后首次评测 | SUCCEEDED，3/3 通过 |
| 同一保存版本首次复用 | SUCCEEDED，2/3 通过，判定 FAILED；空文本输入含义不明确 |
| 编辑输入并保存为新版本后评测 | SUCCEEDED，3/3 通过 |
| 新保存版本再次复用 | SUCCEEDED，3/3 通过；与上一次 set_version_id 相同 |
| 故意将 Skill 输出前缀改为 BROKEN 的反例 | SUCCEEDED，0/3 通过，判定 FAILED；裁判正确拒绝 |

初始生成的空文本输入是“请按约定标记文本：”。它第一次得到预期答案，复跑时模型要求提供文本，现有断言将其正确判错。这条 2/3 结果与原报告完整保留。随后创建新草稿，将输入明确为“标记空字符串（长度为 0 的文本）”，只改输入，不修改 expect 或 judge；保存、启用新版本后，两次独立任务均为 3/3。该结果证明维护与复用链路，也保留了生成案例需要人工检查歧义的实际限制。

生成完成时评测集没有自动启用或自动开始评测。三类裁判报告的 HTML 预览返回成功并保留 sandbox CSP；生成模型选择只输出 JSON 格式，相关评测报告按实际产物保留，没有伪造 HTML。原始日志和模型任务 ZIP 留在忽略的私有目录。

## Docker 配套备份与恢复

完成任务后停止 API 和 Worker 写入者，取得同一备份点的 PostgreSQL custom dump 与 center、worker、model、database、builtin 五个文件 root。只排除可重建的 model/tmp，并写入备份 manifest。备份含登录资料，仅保存在私有目录，不属于源码分发资产。

在全新 Compose 项目和空命名卷中，先核对并恢复文件，按 UID 10001 恢复所有权，再引导数据库、pg_restore，最后启动 API 与 Worker。检查结果：

- 原管理员会话仍有效，7 个任务及冻结输入、状态和判定保持。
- 所有任务报告重新下载，产物摘要与原中心逐一相同。
- 原 Worker 身份与连接指纹保持，收到恢复后的新心跳。
- 恢复后的 codex login status 仍为 ChatGPT 登录；没有为恢复检查再次运行模型任务。
- 恢复项目的写入者已停止，随后恢复原验证项目运行；没有让两套中心同时使用恢复的执行身份。

恢复命名卷与配套备份保留在本机私有位置。原验证项目已重新运行，订阅登录保留供继续联调使用。

## 复核与后续

本次新增内容为验证记录与文档，不修改模型执行代码；当前 Worker 镜像内 engine.py、runtime.py 与本地源文件摘要一致。此前 45 项 Python/PG 测试、19 项前端测试是对应历史代码检查点，本轮未冒充重复运行；当前公开候选扫描和 diff 检查另行执行。

未安装的 glic-check、skill-release-audit 没有冒充工具审计；本轮没有远端 CI 或发布。后续优先补原生 Linux x86_64 的安装、内核沙箱与真实模型链路，并继续按完整验收矩阵处理未测分支。
