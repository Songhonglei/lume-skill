# Docker Desktop 与 Linux Worker 增量验证

日期：2026-10-25（Asia/Shanghai）。基线为 main `eca5e692c142d0305d4dd5ef1029874720715d7e` 上的本地改动；未推送、未运行本轮远端 CI、未发布 Release 或镜像。机器为 macOS 26.5.1 / arm64。

## 结论

Docker Desktop 已安装并可运行容器。原生 arm64 Worker 的沙箱正反检查、中心空卷引导、内置 Worker 接入和重启保持通过。独立 Linux x86_64 ZIP 在 Docker Desktop 的 amd64 模拟环境中完成私有安装、单次码接入、容器重启后复用连接、重复码拒绝和撤销检查。

**本轮真实模型请求为 0。** amd64 模拟路径不能安装 Codex 自身的 seccomp 过滤器；原生 Linux x86_64 尚无目标机器实测。原生 arm64 路径的真实推理与生成也未补齐，当前可用模型连接仍待恢复。这些结论不等同于 Linux 或 Docker 完整验收通过。

## 环境与隔离

- Docker Desktop 4.96.3（244472），官方 arm64 DMG 摘要校验和应用签名检查通过。Engine 29.9.2、Compose 5.6.1、LinuxKit 7.0.14。
- 首次启动等待 Rosetta，安装 Apple Rosetta 2 后恢复；没有替换系统 Codex、skill-up 或 Node。Docker CLI 链接到现有用户 bin 目录，未使用 Homebrew 的全局 kubectl 链接步骤。
- Compose 使用新的验证项目和空命名卷，中心端口仅绑定回环地址。数据库为固定 PostgreSQL 17.10，Python 3.12.12、Node 24.19.0、skill-up 0.14.0、Codex 0.162.1。
- 独立 Worker 以 UID 10001 安装到新应用目录，创建私有 venv；凭据留在其连接目录，权限 0600。测试中用中心容器的网络命名空间提供同机回环连接，没有挂 Docker socket、宿主 HOME 或中心文件库。
- amd64 运行依赖 Rosetta 模拟，arm64 Worker 为该 VM 的原生架构；两者分别记录。没有将模拟环境称为原生 x86_64 主机。
- 最初空间不足，缓存清理被本机删除保护阻止；随后观测到磁盘可用空间恢复，本轮未自动执行清理脚本。Doubao、ego 缓存均未由本轮删除。

## 实际发现与修复

1. Docker 默认 seccomp 拒绝非特权用户命名空间，Bubblewrap 在模型前停止。Compose Worker 改用 OpenAI Codex Security 的固定上游有限配置，同时 `cap_drop: ALL`、非 root 和 `no-new-privileges`。配置默认动作为 `SCMP_ACT_ERRNO`，没有使用 `unconfined`、特权容器或 `SYS_ADMIN`。来源、固定提交与原始字节摘要见 [来源清单](../../../deploy/worker-seccomp.SOURCE.json)，Apache-2.0 许可和 notices 已配套。
2. 原生 arm64 上，命名空间问题解除后原探针仍因只读文件系统失败。固定 CLI 的 sandbox 子命令需要显式 `-c 'sandbox_mode="workspace-write"'`，已使自检与真实评测的权限模式一致。自检仍必须成功才进入模型阶段。
3. 撤销 Worker 后，服务端已返回 401，但 CLI 原来打印错误后以 0 退出。现将 401/403 交给 CLI 的错误出口，实际撤销重试退出码为 1；不重试模型，也不自动重新接入。

配置变更只提供 Bubblewrap 所需的命名空间能力；内核权限、容器 seccomp 和 Codex 自身沙箱仍共同约束执行。原生 arm64 实测 `CapEff=0`、`NoNewPrivs=1`、`Seccomp=2`。工作区探针可读写，受保护的工作区外 home 路径仍返回只读文件系统。Codex 的 workspace-write 默认还允许部分临时目录，本次负例没有把 `/tmp` 误当作一律禁止写入的位置。

Linux 宿主的 AppArmor 或内核用户命名空间限制仍可能另行阻止执行；本次未改宿主安全策略。有限配置不意味着任意 Linux 环境均已支持。

## 收据与边界

| 项目 | 本次结果 |
| --- | --- |
| 官方 DMG、签名、CLI、Engine、Compose | PASS |
| arm64 / amd64 固定工具镜像构建 | PASS；均为本地验证镜像，未公开分发 |
| 新空卷 init → PG → API → 内置 Worker | PASS；唯一内置 Worker、精确工具版本 |
| DB/API/Worker 重启 | PASS；原会话、内置身份和新心跳保持；保留原容器与卷，未冒充另一次完整恢复 |
| 独立 Linux x86_64 ZIP 安装 | PASS（amd64 模拟）；新目录、私有 venv、哈希锁定依赖与精确工具 |
| 新码接入 / 使用过的码 | PASS；重复兑换返回 401 |
| Worker 容器重启后复用 | PASS；无需新码，身份和长期 token 保持 |
| 撤销后的再次启动 | PASS；服务端拒绝，CLI 退出 1 |
| Docker 默认策略沙箱 | FAIL；Bubblewrap 无法创建用户命名空间 |
| arm64 + 有限策略 + 显式 workspace-write | PASS；可写工作区、保护路径拒写、CapEff 0 / NNP 1 / Seccomp 2 |
| amd64 模拟 + 同一有限策略与探针 | FAIL；`Sandbox(SeccompInstall(... EINVAL ...))`，尚未进入模型 |
| Python/PG 测试 | 45/45 PASS；使用独立测试 PG 17.10 与每测试独立 schema |
| Ruff / 公开候选扫描 / Compose 配置 | PASS；上游 profile 与 vendor 摘要通过 |
| 真实模型 / 三类裁判 / 生成 | NOT_RUN；本轮 0 次模型请求 |
| 原生 Linux x86_64 主机、Docker 配套恢复 | NOT_RUN |

最终 ZIP 哈希、源文件哈希、镜像身份和脱敏收据见 [docker-worker-2026-10-25.json](docker-worker-2026-10-25.json)。Mac ZIP 也随当前源码重新打包，本轮没有对该 Mac ZIP 重做独立安装或真实模型验收。模型登录、接入码、cookie、完整 Docker 诊断包和运行日志只保存在忽略的私有目录。

模型连接检查中，已配置的本地 Qwen 文本服务未启动，现有本地代理只提供 Chat Completions；Harness 的远程 Responses 网关域名未能解析，本地 Responses 网关端口也未启动。未借用当前聊天生成结果伪装 Worker 执行，未读取或复制宿主 Codex 登录资料，未把凭据写进镜像或仓库。

## 复核与后续

本次按 U/G/L/I/C 维度人工复核：诊断与真实模型分开；探针匹配工作区权限；撤销失败不再返回成功；有限策略来源/许可/摘要齐全；打包继续采用白名单。新增测试保护非特权配置、敏感系统调用限制、显式读写模式和 401/403 的失败出口。glic-check 与 skill-release-audit 工具在当前环境仍不可用，未冒充工具审计或远端 CI；随附 Skill 未修改。

下一步：在原生 Linux x86_64 机器运行当前 ZIP 与沙箱检查，并记录该机 AppArmor/内核结果；恢复一个可用的 Responses 模型连接，在已通过沙箱的原生 arm64 路径补真实三类裁判、生成草稿与启用复用，然后完成目标平台的配套备份恢复。仅安装/接入通过不能提升 AC-27/28/32 为整体 PASS。
