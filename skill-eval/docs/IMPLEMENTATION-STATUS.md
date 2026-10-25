# 实现进度

2026-10-25 用户决定将本轮修复和验证记录整合到 main，原生 Linux x86_64 暂缓，保留未验证状态，不扩大为发布通过。最新源码整合说明见 [main 整合记录](verification/local/main-integration-2026-10-25.md)；后文未推送/待合并描述保留为历史检查点。

2026-10-25 最新：ChatGPT Pro 独立登录后，Docker Desktop 原生 ARM64 的真实模型连接、三类裁判、生成、案例维护与保存版本复用、错误 Skill 反例以及全新卷配套恢复已有收据。原始生成案例的 2/3 复跑保留；明确空文本输入的新版本连续两次 3/3。详见 [Pro / Docker 验收](verification/local/pro-docker-e2e-2026-10-25.md)。原生 Linux x86_64 仍待验证，本地修改未推送；以下表格是较早实现基线。

2026-10-25 Docker / Worker 增量：Desktop 安装、空卷引导、内置 Worker 与重启通过；Linux amd64 模拟环境 ZIP 安装、接入和重连通过；有限 seccomp 配置和显式 workspace-write 自检使原生 arm64 沙箱正反检查通过。新增鉴权失败非零退出修复。当前为本地候选，原生 x86_64 及真实模型平台验收尚未完成，见 [Docker / Worker 收据](verification/local/docker-worker-2026-10-25.md)。

2026-10-25 本地续开发：案例源码与附件编辑发现的白屏、BOM 字节丢失和旧快照回写问题已修复；增加同名替换确认、保存期间编辑保护与 19 项前端测试。40 项原有 Python 测试通过，生产构建及浏览器新增边界验证通过。环境、收据与剩余限制见[续开发记录](verification/local/continuation-2026-10-25.md)。以下历史平台结论保持原边界，当前本地改动尚未提交远端。

2026-10-24：源码与本机主链路已实现，PR #1/#2 已合入公开合集 main，最新代码基线 CI 已通过。用户明确要求先合并、在其他电脑继续 Docker 验证；正式版本与镜像尚未发布。接手入口：[完整交接](AGENT-HANDOFF.md)。

| 工作包 | 当前状态 | 证据 / 剩余 |
| --- | --- | --- |
| D00–D03 干净仓库与合成素材 | 本机完成 | 全新 Git 历史、来源清单、锁文件、合成 Skill；原创代码 MIT；目标 lume-skill/skill-eval 已明确 |
| D10 固定 skill-up | 完成 | 官方 0.14.0 分平台 SHA256；私有安装，不覆盖全局版本 |
| D11 Codex 兼容 | 本机完成 / 容器待验 | 0.162.1 + workspace-write 真实运行；未降级沙箱 |
| D12–D15 CLI、三类裁判、生成与故障 | 本机完成 | verification/p1；真实生成质量、错误模型、缺登录、超时及结果映射 |
| D20–D26 资源与案例版本 | 本机完成 | ZIP/目录、evals.json 预览、编辑与高级字段保留、不可变保存版本、启用/默认、全量校验 |
| D30–D35 任务与 Worker 协议 | 本机完成 | 共用队列、幂等、冻结输入、单码接入、续约、取消、撤销、迟到结果与手动重试；真实 HTTP E2E |
| D36 独立 Worker 安装 | macOS 完成 / Linux 待验 | 私有 venv、固定工具与源码 ZIP；Linux 未实测 |
| D40–D46 四页与生成闭环 | 本机主链路完成 | 浏览器上传→确认生成→维护→启用→4/4→复用4/4；单管理员与配置页已实现 |
| D50–D54 Compose、首次引导、镜像 | CI 引导通过 / 真实模型平台待验 | Podman arm64 实际构建、空卷引导、自动接入、非 root、重启与配套恢复通过；Codex devpts 沙箱失败，已加模型调用前自检；Linux x86_64 CI 构建、空卷引导、重启与会话/唯一 Worker 保持通过；目标平台真实模型另验 |
| D55 文档与备份恢复 | 本机与 Podman 完成 / Docker 待验 | OPERATIONS.md；PG 与配套文件恢复到新库、新目录，摘要和历史一致 |
| D60 验收矩阵 | 已记录 | verification/local/acceptance.md；明确局部覆盖和未测项 |
| D61–D62 来源与审计 | 本机候选已审阅 | 来源/第三方许可、秘密扫描、UGLIC、skill-release-audit；误报与修复证据保留 |
| D63 远程同步与源码合并 | 完成 | lume-skill/skill-eval；MIT；PR #1/#2 已合 main，CI 40080630091 通过 |
| D64 正式发布与发布后重装 | 未执行 | 未发布正式 Release/GHCR 镜像；目标平台真实验收、公开发布后重装仍待补齐 |

完整证据入口：[本机验收](verification/local/README.md)。本次交付范围为源码、本机验证、可审阅安装及部署候选；不能据此把 AC-27、AC-28、AC-31、AC-32 标成整体通过。
