import type { Settings } from './types'

export function localCenter(url: string) {
  try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname) } catch { return false }
}
export function canConnectCenter(url: string) {
  try { const protocol = new URL(url).protocol; return protocol === 'https:' || (protocol === 'http:' && localCenter(url)) } catch { return false }
}
export function centerNotice(url: string) {
  if (localCenter(url)) return '当前中心为本机地址，仅支持本机接入。其他电脑需使用可访问的 HTTPS 中心地址。'
  try { if (new URL(url).protocol !== 'https:') return '远程接入需要 HTTPS 中心地址，请先修改中心配置，再生成接入指令。' } catch { return '中心地址无效，请先检查中心配置。' }
  return ''
}
export function installationPrompt(versions: Settings['required_versions']) {
  return `请在当前电脑安装并初始化 LumaSkill 独立评测 Worker，完成后等待接入指令。
安装助手支持任意具备终端执行能力的 Agent；评测由 Worker 独立安装的 Agent CLI 执行。保留安装助手现有工具、模型和登录配置，安装阶段不启动 Worker。

1. 检查系统：支持 macOS arm64、Linux x86_64；Linux 原生环境仍待验收，不要将安装成功当作模型/沙箱验收。Windows 原生或其他架构请停止并说明。检查 Python 3.11+（含 venv/pip）、Git、Node.js 22+ 和 npm，以及下载依赖的网络。缺少依赖时先说明缺项，不改写系统已有 Python、Agent CLI 或全局 Skill。
2. 如已有本项目的 start-worker，先核对应用目录、工具版本和连接记录，可复用匹配的安装；不要覆盖已有应用、连接凭据或正在运行的 Worker。否则从公开仓库获取源码，在新的应用目录安装：

\`\`\`bash
LUMA_SOURCE_DIR="$(mktemp -d)"
git clone --depth 1 https://github.com/Songhonglei/lume-skill.git "$LUMA_SOURCE_DIR/lume-skill"
cd "$LUMA_SOURCE_DIR/lume-skill/skill-eval"
# 先核对 deploy/toolchain.json：Agent CLI ${versions.codex}，skill-up ${versions.skill_up}；不一致时停止。
LUMA_APP_DIR="$HOME/.local/share/skill-eval/worker-$(date +%Y%m%d-%H%M%S)"
python3 deploy/install_worker.py --directory "$LUMA_APP_DIR" --install-codex
"$LUMA_APP_DIR/deploy/codex/node_modules/.bin/codex" --version
"$LUMA_APP_DIR/bin/skill-up" --version
"$LUMA_APP_DIR/start-worker" --help
\`\`\`

3. 安装器会准备私有 Python 环境、固定版 Agent CLI/skill-up、Worker 脚本及 vendor/skill-upper 评测 Skill。不需要安装中心、数据库，或把评测 Skill 另装到 Agent 的全局目录。记录源码提交、应用目录、start-worker 路径及实测工具版本；当前中心要求 Agent CLI ${versions.codex}、skill-up ${versions.skill_up}。
4. 为此 Worker 选择独立的 --state-dir，保存接入记录；确认使用哪个 --codex-home（默认读取 CODEX_HOME 或 ~/.codex）。不要覆盖现有登录或上传登录文件。需要登录 Agent 时由用户在本机完成；不要索取、回传密码、API Key 或 auth.json。
5. 仅做版本与启动参数检查，不执行模型、评测或连接实测，不关闭沙箱。安装完成后，回报路径、版本、登录是否就绪和未完成项，请用户回工作台生成接入指令；此时再获取接入码，避免安装期间过期。`
}

export function connectionPrompt(url: string, code: string, versions: Settings['required_versions']) {
  return `请将已安装的 LumaSkill 独立 Worker 接入以下中心：
中心地址：${url}
要求版本：Agent CLI ${versions.codex}；skill-up ${versions.skill_up}。
${localCenter(url) ? '该地址仅支持中心所在主机。请先确认 Worker 与中心在同一台主机；跨主机必须先在中心配置 Worker 可访问的 HTTPS 地址，再生成新指令，不要猜测或修改接入码里的地址。\n' : centerNotice(url)}
1. 使用上一步记录的 start-worker、独立 --state-dir 和选定的 --codex-home；先核对版本、网络与本机登录。缺安装时先完成安装，不改全局工具或登录。已有正确连接时直接复用，无需兑换新码；连接指向其他中心或已撤销时，保留旧状态目录，另选新 --state-dir 接入。
2. 启动 Worker（APP_DIR、STATE_DIR、CODEX_DIR 使用已确认的实际路径）：
\`\`\`bash
"APP_DIR/start-worker" --state-dir "STATE_DIR" --codex-home "CODEX_DIR"
\`\`\`
3. 在“粘贴工作台接入码”的隐藏输入中输入下面的完整接入码。不要将码拼到命令行参数、日志或提交文件中。接入码生成后 10 分钟有效、仅可使用一次；过期或已使用时请用户在工作台重新生成，不要反复重试旧码。

${code}

4. 启动后 Worker 会自动领取匹配的排队任务，可能产生模型费用；不要额外发起评测或“检查连接”。保持进程运行，记录停止与再次启动的方法。不要关闭沙箱、删除已有连接记录，或自动撤销其他 Worker。
5. 以工作台出现该 Worker 且状态为“在线”作为接入完成；登录就绪、模型配置和真实调用分别说明。“检查连接”会调用一次模型，需用户另行点击。回报应用目录、状态目录、版本、在线/登录状态及下一步，隐藏接入码和长期凭据。`
}
