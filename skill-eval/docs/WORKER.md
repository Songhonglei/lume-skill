# 独立 Worker 安装包

## 从工作台接入

在“系统配置 → 接入 Worker”打开向导：

1. **安装**：复制安装指令，发给执行电脑上的 Codex 等 Agent。指令检查平台、Python、Git、Node/npm，使用仓库现有安装器准备私有 Python 环境、固定版 Codex/skill-up、Worker 与 `vendor/skill-upper` 评测 Skill；记录应用目录、状态目录、登录目录和工具版本。已有匹配安装可复用，不需要安装中心、数据库或全局 Skill。
2. **接入**：安装完成后点“已安装，生成接入指令”，再复制给该 Agent。此时才生成 10 分钟有效、一次使用的接入码；指令说明启动参数、隐藏输入、在线验收、重新连接与凭据保留。过期后不可复制，需重新生成。

接入后会自动领取匹配的排队任务，可能产生模型费用；安装指令不会启动 Worker 或调用模型。“检查连接”另需用户点击。登录由用户在 Worker 本机完成，不能把登录文件或长期凭据回传给中心/对话。

本机地址只能用于中心所在主机；其他电脑需要可访问的 HTTPS 中心地址。向导会提示本机限制，并阻止为非 HTTPS 远程地址生成指令。安装指令可随时复制，授权不要提前生成。当前公开源码来自 `Songhonglei/lume-skill` 的 main，执行端须先核对 `deploy/toolchain.json` 与中心要求的工具版本，不一致时停止，不自动改全局工具。

## 安装包方式

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

平台证据分别记录：Linux x86_64 ZIP 曾在 Docker Desktop amd64 模拟环境完成安装、接入、重连，该模拟路径的 Codex seccomp EINVAL 保留；原生 Linux x86_64 的独立安装、沙箱和真实模型验收由用户暂缓。Docker Desktop 原生 arm64 的沙箱、Pro 独立登录、三类裁判、生成、复用和配套恢复已有 2026-10-25 至 10-31 实测，不能推广为此 Linux ZIP 或任意宿主均通过。重新打包仅说明新文件身份，不能沿用旧 ZIP 的安装/模型结论。源码中的 docs/verification/local 保留各检查点，完整收据不随 Worker ZIP 分发。

## 候选包的身份与升级

当前仍为 0.1.0 开发候选，没有正式发布资产。候选清单将源码提交、文件 SHA256 和平台实测分开记录。ZIP 内 platform 标签表示安装器目标，不是该平台验收标志。Linux x86_64 包可离线构建与核对内容，用户暂缓期间不运行其原生安装或模型验收。

使用新的应用目录安装；state-dir 与独立 Codex 登录目录分别持久保存，不要复用其他正在运行的 Worker 的 state-dir。首次运行建议明确传入 --state-dir 和 --codex-home，以免读取默认用户目录。需要私有工具时用 --install-codex，不更换固定版本。

私有 venv 依赖创建时的基础 Python，安装后不要移动或卸载该基础解释器；更换 Python 时在新目录重新安装。安装器使用符号链接保留独立 Python 发行版的动态库定位，不把生成的 venv 当作跨机器可搬移的二进制发行包。
