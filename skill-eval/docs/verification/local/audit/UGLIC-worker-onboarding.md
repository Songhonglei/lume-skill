## UGLIC 检查 — Worker 安装与接入向导

2026-11-04，相对 main `900f8d7`；按用户授权实现、验证并发布。

### U — Usability & User Experience

已修复 U1（ERR）：`SettingsPage.tsx` 原接入弹窗只提供接入码，空白执行电脑没有安装步骤。`WorkerOnboarding.tsx` 先给 Agent 安装指令，再由用户在准备好后生成接入指令；已有安装可直接继续。`workerSetup.ts` 说明平台、依赖、现有安装器、CLI 与评测 Skill、目录、登录和验收，执行端不用猜测缺失步骤。安装不能覆盖系统工具或既有连接；Linux 原生验收边界保留。

已修复 U2（WARN）：进入弹窗即生成 10 分钟码，安装耗时可能使码提前过期。现在安装阶段零授权写入，接入阶段才生成；过期显示恢复操作并禁止复制旧指令。浏览器复制、切换、重新生成、过期和 390px 布局通过。

### G — Grammar

✅ 34 项前端测试、TypeScript/Vite、Ruff 与公开源码检查通过。安装/启动 Shell 块经 bash -n 检查；测试对齐实际 deploy/toolchain.json。无新依赖、字体、外部素材或全局安装动作。

### L — Logic

✅ `WorkerOnboarding.tsx` 复用原鉴权/CSRF 接入码 API；打开安装页不 POST，生成按钮有 busy 防重复，失败可重试。到期按请求开始时间计算，定时器随组件关闭清理；返回安装页不暴露码。界面禁止复制过期码，服务器仍为兑换有效性的最终依据。安装期不启动领取任务，接入期才说明自动领取。

✅ `workerSetup.ts:canConnectCenter/centerNotice` 与 Worker 的地址契约对齐：HTTP 仅 localhost、127.0.0.1、::1，其他地址要求 HTTPS。测试覆盖 IPv4/IPv6 本机、HTTPS、远程 HTTP 和无效 URL；不建议猜测或替换码内中心地址。

### I — Integrity

✅ 指令使用现有 `deploy/install_worker.py --directory … --install-codex`、私有 CLI 路径和 start-worker 的 --state-dir/--codex-home 参数；vendor/skill-upper 已由安装器复制，不虚构新 Skill 或下载端点。源码来自真实公开仓库 main，先核对中心所需工具版本，不一致即停止；不宣称源码/安装/在线等于模型验收。文档与 UI 一致。

### C — Containment

✅ 安装提示不含码，接入码只进入文本与复制动作，不拼入 Shell 参数，不写 localStorage、日志或仓库。提示用户本机完成登录，不回传 auth.json；不自动运行模型或“检查连接”，不更改沙箱。测试生成码只在隔离 QA、没有兑换；主预览只验证安装页及复制。未改后端、权限、码有效期、安装器、Worker、依赖锁定或 Skill Manage。

### Skill 六模块复核

vendor 与示例全量重跑，输出与 [vendor-after.json](vendor-after.json)、[example.json](example.json) 完全一致：0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。原始 code、位置和分类保留于基线，沿用[逐项判断依据](skill-release-audit.md)，不修改第三方内容清除误报。根应用不是 Agent Skill，N/A。

## 汇总

| 编号 | 原级别 | 结果 |
| --- | --- | --- |
| U1 | ERR | 补齐可执行的 Agent 安装/初始化与接入指令 |
| U2 | WARN | 安装后再生成授权码，并提供过期恢复 |

无未解决的实际 ERR/WARN，无待确认修复项。[验证范围](../worker-onboarding-2026-11-04.md)不包含新增机器安装或模型验收，远程完整 CI 通过后合 main。
