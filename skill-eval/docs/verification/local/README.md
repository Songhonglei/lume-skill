# 本机验收记录

更新日期：2026-10-25（Asia/Shanghai）。当前功能已合并并推送 main（78e4527 / bca9c23），CI 40203314300 成功。阶段总结和后续计划见 [实现进度](../../IMPLEMENTATION-STATUS.md)，逐项覆盖见 [验收矩阵](acceptance.md)。

| 当前检查点 | 结论与证据 |
| --- | --- |
| 源码与 main CI | [main 整合](main-integration-2026-10-25.md)、[CI 收据](main-ci-2026-10-25.json)：45 项后端、19 项前端与无模型 Docker 构建/引导/重建检查通过 |
| 案例编辑器 | [continuation](continuation-2026-10-25.md)：异常 YAML、附件字节、替换确认、异步保护、旧快照与只读版本 |
| Docker 与 Worker | [docker-worker](docker-worker-2026-10-25.md)：有限沙箱、引导重启；amd64 模拟独立 ZIP 安装接入与撤销；该轮 0 次模型调用 |
| Harness 历史连接 | [harness-gateway](harness-gateway-2026-10-25.md)：最小文本成功、Codex 通道受限；不再是当前 Pro 路径的阻断 |
| Pro / ARM64 Docker | [pro-docker-e2e](pro-docker-e2e-2026-10-25.md)：三类裁判 3/3、生成 3、维护后两次 3/3、错误 Skill 0/3、7 任务配套恢复 |
| 原生 Linux x86_64 | 用户暂缓，维持 NOT_RUN/PARTIAL；无模型 CI 与 amd64 模拟不能代替 |
| 发布 | 无正式 Release/GHCR，公开发布后的全新重装未执行 |

本目录只存合成数据、脱敏摘要与产物 SHA256。模型登录、口令、Worker 凭据、完整日志和含凭据备份保存在私有目录，不进入源码。历史收据的“未推送”“0 次调用”属于其当时检查点，不改写为后续实测。

## 2026-10-24 历史基线

以下历史表格保留当时状态，不能覆盖上面的当前索引。环境为 macOS arm64、PostgreSQL 17.10、Python 3.12.12、Node 24.19.0、skill-up 0.14.0、Codex 0.162.1；原生主链路对应旧开发仓库 6e70417977f53dee798a676d76ddcb81a4ef0886，后续 Podman 证据见 containers.json。旧仓库提交不保证能在当前合集检出。

### 当时已验证

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

### 当时未验收

| 项目 | 状态 / 原因 |
| --- | --- |
| Linux x86_64 独立 Worker | NOT_RUN；当前机器为 macOS arm64 |
| Linux Compose 与 macOS Docker Desktop | Linux x86_64 CI 构建/空卷引导/重启通过；真实推理/生成及 Mac Docker Desktop 完整路径未验 |
| 容器 Codex 默认沙箱真实兼容 | Podman arm64 已实测失败：devpts 挂载拒绝；新自检在调用模型前拦截。Docker 目标平台另验 |
| 容器全新环境、重启与恢复 | Podman Linux arm64 通过；全新项目/卷恢复后会话、Worker、任务与报告摘要一致。不能替代 Docker Desktop/Linux x86_64 验收 |
| GitHub CI 与多架构镜像发布 | CI 40080630091 已通过，源码 PR #1/#2 已合 main；多架构镜像发布仍 NOT_RUN |
| 公开发布后的最短重装 | NOT_RUN；没有已发布版本 |
| 本项目公开许可证和目标仓库 | 已明确：MIT；Songhonglei/lume-skill 的 skill-eval。候选源码接入和正式发布分开记录 |

因此本机开发候选可以审阅和试用，**尚未达到正式版本/镜像发布放行条件**。最后一轮独立页面复核因原浏览器会话结束未执行，沿用已有完整主流程实测；最新源码的类型检查、构建和 API 检查已通过，未把这些检查替代为新的浏览器实测。

后续品牌变更已单独完成浏览器检查，见 [UGLIC-brand.md](audit/UGLIC-brand.md)；这不等于重跑此前全部业务边缘场景。修订 Mac ZIP 的安装/重连证据见 [handoff-checkpoint.json](handoff-checkpoint.json)，未为该包重复模型调用。

完整逐条状态见 [acceptance.md](acceptance.md)，审计见 [audit/UGLIC.md](audit/UGLIC.md)。
