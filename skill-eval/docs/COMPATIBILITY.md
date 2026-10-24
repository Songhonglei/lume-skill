# 执行兼容记录

本文下表为 2026-10-23 原生阶段的历史实测快照。2026-10-24 增量：公开 main CI 已验证 Linux x86_64 Docker 构建、空卷引导及重启；Podman arm64 沙箱实测失败；目标 Docker 真实模型与独立 Linux 安装仍待补齐。当前状态见 [交接文档](AGENT-HANDOFF.md)。

2026-10-23 实测。所有模型调用均使用用户已有的 Codex 连接，隔离复制所选连接与登录；未改写系统工具和原始 Skill。

| 环境 / 功能 | 结果 |
| --- | --- |
| macOS arm64，Python 3.12.12，Node 24.19.0 | 本机开发环境 |
| skill-up 0.14.0 官方 arm64 发布包 | 下载 SHA256 与官方发布信息一致 |
| Codex CLI 0.162.1，已有 ChatGPT 登录 | 原生 adapter 实际可用，workspace-write，无沙箱降级 |
| 请求模型 gpt-6-astra | 连接可用；上游报告只核实 CLI 版本，实际服务端模型身份显示“未核实” |
| 全量 validate / list-cases / run / event-log / JSON / HTML | 真实运行产物已核对 |
| rule_based / script / agent_judge | 各一个真实案例通过；语义裁判使用独立会话 |
| Codex + 固定 skill-upper 生成 | 生成 5 个候选案例，结构校验通过，未修改 Skill，未自动发起评测 |
| 同一生成集测试正常 / 缺陷 Skill | 正常 5/5 PASS，错误标签前缀变体 0/5 PASS |
| 错误模型 / 缺少登录 / 1 秒案例超时 | 均产生 ERROR/不完整结果；系统映射为 FAILED + INCOMPLETE |
| Linux x86_64、Compose、macOS Docker Desktop | NOT_RUN：当前开发机未安装 Docker，不作为已通过项 |

脱敏摘要及原始产物 SHA256 见 [P1 证据](verification/p1/)。完整原始记录保留在本机私有测试区域，不公开账号标识、连接地址和绝对工作路径。

两项实测修正：脚本判分遵循退出码协议，Python 脚本必须有 shebang；所有任务使用独立目录并设置 Git 探测边界，避免上游向父仓库建立基线提交。已确认新工作区不加载父目录 AGENTS 或无关 Skill。

当前不支持 input.turns：0.14.0 的 Codex resume 路径固定携带绕过沙箱参数，不能在未告知的情况下接入。导入时给出字段级问题，不删除后执行。
