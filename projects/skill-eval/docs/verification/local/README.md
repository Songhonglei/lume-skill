# 本机验收记录

记录日期：2026-10-24。环境：macOS arm64；PostgreSQL 17.10；Python 3.12.12；Node 24.19.0；skill-up 0.14.0；Codex 0.162.1。模型为用户已选择的可用 Codex 连接，实际服务端模型身份未核实。

本机验收对应源码提交：`6e70417977f53dee798a676d76ddcb81a4ef0886`。上述提交对应原生主链路证据；后续容器引导、自检与备份修复单独记录在 [containers.json](containers.json)，不将旧原生收据改写成新实测。

本目录只存合成数据、脱敏摘要与产物 SHA256。模型登录、中心口令、Worker 凭据、真实连接地址和完整运行日志保留在私有目录，不进入源码。

## 已验证

| 场景 | 证据 / 结果 |
| --- | --- |
| 原生三类裁判真实运行 | ../p1/three-judges.json；rule_based、script、agent_judge 各一个案例 PASS |
| 真实生成质量 | ../p1/generated-good.json、generated-bad.json；正常变体 5/5，预设错误前缀变体 0/5 |
| 生成与执行错误 | ../p1/missing-login.json、wrong-model.json、timeout.json；真实错误均未被映射为通过 |
| API → 独立 Worker → 原始报告 | e2e.json；第一个任务三类案例 3/3 PASS，原始产物已回传 |
| 网页上传无案例 Skill | label-text-ui 合成包；取消生成不创建任务，确认才调用 Codex |
| 网页生成与维护 | 真实生成 3 个草稿案例，编辑名称、前置断言并新增数字案例，保存启用后 4/4 PASS |
| 再次评测复用 | 第二次直接确认全部 4 个案例，未创建生成任务；同一 set_version_id，4/4 PASS |
| 原始报告隔离 | 浏览器可预览 HTML；iframe 只有 allow-scripts，同源 DOM 读取为 false；下载 ZIP 与源产物相符 |
| 真实网络故障 | network-faults.json；短暂断连恢复4/4，超过租约中断，迟到回执不覆盖手动重试后的终态，各一次执行无自动重跑 |
| 持久化与恢复 | restore.json；PG custom dump + 文件配套备份，恢复到新数据库和目录，4 条任务、资源版本、报告和会话一致 |
| 自动检查 | 40 项测试通过；Ruff 通过；TypeScript 与 Vite 生产构建通过 |
| 模型连接检查 | model-probe.json；真实调用成功，实际模型身份仍标为未核实 |
| 独立安装 | macOS arm64 安装器实际创建私有 venv，锁定依赖并验证 skill-up；未改动全局工具，原 Worker 接入凭据可继续使用；最终 ZIP 安装后真实三类裁判3/3通过，见 packaged-worker-e2e.json |

自动测试使用每个测试独立的 PostgreSQL schema，覆盖资源版本不可变、草稿并发冲突、鉴权/CSRF/登录限速、幂等与并发领取、租约过期和迟到结果、取消与撤销、判分完整性、归属与版本匹配、进程树停止与守护进程、ZIP 边界以及备份摘要/覆盖保护。合成协议回执只证明协议，不作为真实模型调用证据。

浏览器实测发现并修复了保存新版本时被旧列表选回草稿的竞争、导入 notes 对象显示问题，以及跨页数据未及时刷新的问题。后续状态以对应复核记录为准，不把后端单测当成浏览器验证。

## 尚未验收

| 项目 | 状态 / 原因 |
| --- | --- |
| Linux x86_64 独立 Worker | NOT_RUN；当前机器为 macOS arm64 |
| Linux Compose 与 macOS Docker Desktop | NOT_RUN；用户明确允许本次先完成源码和本机验证，容器另补 |
| 容器 Codex 默认沙箱真实兼容 | Podman arm64 已实测失败：devpts 挂载拒绝；新自检在调用模型前拦截。Docker 目标平台另验 |
| 容器全新环境、重启与恢复 | Podman Linux arm64 通过；全新项目/卷恢复后会话、Worker、任务与报告摘要一致。不能替代 Docker Desktop/Linux x86_64 验收 |
| GitHub CI 与多架构镜像发布 | NOT_RUN；仅写入工作流，未连接远程仓库或推送 |
| 公开发布后的最短重装 | NOT_RUN；没有已发布版本 |
| 本项目公开许可证和目标仓库 | 已明确：MIT；Songhonglei/lume-skill 的 projects/skill-eval。候选源码接入和正式发布分开记录 |

因此本机开发候选可以审阅和试用，**尚未达到公开发布放行条件**。最后一轮独立页面复核因原浏览器会话结束未执行，沿用已有完整主流程实测；最新源码的类型检查、构建和 API 检查已通过，未把这些检查替代为新的浏览器实测。

完整逐条状态见 [acceptance.md](acceptance.md)，审计见 [audit/UGLIC.md](audit/UGLIC.md)。
