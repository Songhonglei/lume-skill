# 独立 Worker 安装包

前提：Linux x86_64 或 macOS arm64、Python 3.11+、venv/pip、联网下载依赖。模型执行另需 Codex CLI 0.162.1 和可用登录；运行 Worker 不需要中心或 PostgreSQL。

1. 核对随包 SHA256，并解压到临时目录。
2. 运行 `python3 deploy/install_worker.py --directory "$HOME/.local/share/skill-eval/app-0.1.0"`。
3. 运行安装完成时显示的 start-worker 路径，粘贴工作台“系统配置”中的单次接入码。

安装目录必须是新目录。可增加 `--install-codex`，使用 Node.js 22+ 和 npm 把固定版本 Codex 安装到应用私有目录；不替换系统 Codex。未指定时使用 PATH 中的版本，版本不匹配会明确拒绝执行。

使用 `start-worker --help` 查看参数。`--state-dir` 默认 ~/.local/share/open-skill-eval-worker，保存连接，后续启动自动重连。`--codex-home` 可选择独立登录目录，默认 CODEX_HOME 或 ~/.codex。升级到新应用目录后继续使用原 state-dir 与登录目录。

接入码含中心 URL，有效期 10 分钟且只可兑换一次。远程连接要求 HTTPS。码已过期或兑换失败时，在工作台重新生成；Worker 被撤销后也需要重新接入。密码、Worker 长期凭据和模型密钥都不包含在 ZIP 中。

本包仅用于单管理员信任的 Skill。暂不支持 Windows 原生 Worker。模型登录到期时在所选 Codex 目录重新登录；不要把该目录或 state-dir 打包成 Skill。真实模型执行可能产生费用。

## Linux 容器中的额外前提

原生 Linux Worker 不需要 Docker。若将本包放进自己维护的 Linux 容器，Docker 默认 seccomp 可能阻止 Codex/Bubblewrap 创建命名空间。随包保留 `deploy/worker-seccomp.json`、来源摘要及许可证；在 Docker 客户端所在机器上选择该配置，同时使用 `--cap-drop ALL --security-opt no-new-privileges:true`，保持非 root。不要增加 `SYS_ADMIN`、使用特权容器或关闭 Codex 沙箱。项目 Compose 已配置这些选项。

2026-10-25 的本机证据：Linux x86_64 ZIP 在 Docker Desktop amd64 模拟环境中安装、接入、重连已验证；该模拟路径安装 Codex 自身 seccomp 时返回 EINVAL，真实评测未通过。Docker Desktop 原生 arm64 Worker 的沙箱读写与保护路径检查通过，仍未补真实模型。模拟安装不代表原生 Linux x86_64 或任意 Linux 内核均已验收。完整证据保留在项目源码的验收目录，不随 Worker 安装包分发。
