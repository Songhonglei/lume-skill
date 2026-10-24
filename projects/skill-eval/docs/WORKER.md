# 独立 Worker 安装包

前提：Linux x86_64 或 macOS arm64、Python 3.11+、venv/pip、联网下载依赖。模型执行另需 Codex CLI 0.162.1 和可用登录；运行 Worker 不需要中心或 PostgreSQL。

1. 核对随包 SHA256，并解压到临时目录。
2. 运行 `python3 deploy/install_worker.py --directory "$HOME/.local/share/skill-eval/app-0.1.0"`。
3. 运行安装完成时显示的 start-worker 路径，粘贴工作台“系统配置”中的单次接入码。

安装目录必须是新目录。可增加 `--install-codex`，使用 Node.js 22+ 和 npm 把固定版本 Codex 安装到应用私有目录；不替换系统 Codex。未指定时使用 PATH 中的版本，版本不匹配会明确拒绝执行。

使用 `start-worker --help` 查看参数。`--state-dir` 默认 ~/.local/share/open-skill-eval-worker，保存连接，后续启动自动重连。`--codex-home` 可选择独立登录目录，默认 CODEX_HOME 或 ~/.codex。升级到新应用目录后继续使用原 state-dir 与登录目录。

接入码含中心 URL，有效期 10 分钟且只可兑换一次。远程连接要求 HTTPS。码已过期或兑换失败时，在工作台重新生成；Worker 被撤销后也需要重新接入。密码、Worker 长期凭据和模型密钥都不包含在 ZIP 中。

本包仅用于单管理员信任的 Skill。暂不支持 Windows 原生 Worker。模型登录到期时在所选 Codex 目录重新登录；不要把该目录或 state-dir 打包成 Skill。真实模型执行可能产生费用。
