# LumaSkill · Skill Eval 完整交接

2026-10-25 最新用户决策：暂缓原生 Linux x86_64 验证，合并本轮开发分支到 main。继续保留该平台的未验证状态；未经用户恢复此项，不主动安排 x86_64 机器或继续该项验证。整合范围和合并前检查见 [main 整合记录](verification/local/main-integration-2026-10-25.md)。下面“未推送”等字样属于各次验证的历史检查点，当前分支状态以 Git 历史为准。

2026-10-25 最新 Pro 登录验收：用户亲自为独立容器授权 ChatGPT 登录；原生 ARM64 Docker Worker 真实连接、三类裁判 3/3、生成 3 个案例、草稿维护、启用复用和配套恢复通过。初始生成案例复跑 2/3 的结果保留，明确空字符串输入后新版本连续两次 3/3；错误前缀 Skill 为 0/3，正确判错。先读 [Pro / Docker 真实链路](verification/local/pro-docker-e2e-2026-10-25.md)。原生 Linux x86_64、其他平台与正式发布仍待验；下列较早检查点保留历史边界。

2026-10-25 最新模型连接增量：Harness 网关已在运行，最小 Responses 文本请求成功；ARM64 Docker Worker 的实际 Codex 请求被上游通道拒绝，两个替代通道返回 502。未绕过服务限制，完整模型验收仍待完成。先读 [Harness 网关检查](verification/local/harness-gateway-2026-10-25.md)。

更新时间：2026-10-24（Asia/Shanghai）。交接对象：继续开发、部署验收和维护本项目的 Agent。

2026-10-25 本地续开发：已修复案例编辑器异常 YAML 白屏、附件 BOM 丢失和保存后旧快照回写，并增加附件替换确认、保存期间编辑保护及 19 项前端回归测试。详见[本次续开发与验证](verification/local/continuation-2026-10-25.md)。本次记录对应本地改动，不表示已合入远端 main；Docker、Linux Worker 和真实模型平台验收的待办状态保持。

同日本地 Docker 增量：已安装 Desktop 4.96.3/Rosetta；修复读写自检误用只读模式和 Worker 鉴权失败退出码；Compose 使用固定上游有限 seccomp 加 cap-drop ALL。原生 arm64 沙箱正反检查、Docker 引导/重启、amd64 模拟 ZIP 安装接入有新增证据；原生 Linux x86_64、真实模型和正式发布仍待完成。后续优先读 [Docker / Worker 验证](verification/local/docker-worker-2026-10-25.md)，下文 2026-10-24 记录继续作为历史基线，不扩展为新模型验收。

目录已按用户最新要求简化为合集根目录下的 `skill-eval/`，不再使用中间 projects 层；工作流、下载后的进入目录及接手指令已同步。本次布局调整不新增模型验收。复核见 [UGLIC-layout.md](verification/local/audit/UGLIC-layout.md)。

## 1. 接手先看这里

项目已经完成可运行的源码、本机真实模型主链路、新版品牌资产及 GitHub CI，源码已合入 main。下一步优先在其他电脑补齐 Docker 的真实模型验收，再决定正式版本与镜像发布。不要重新从需求设计或重写页面开始。

| 事项 | 当前结论 |
| --- | --- |
| 唯一权威仓库 | [Songhonglei/lume-skill](https://github.com/Songhonglei/lume-skill)，多项目合集 |
| 应用目录 | `skill-eval/`，后续命令未特别说明都在此目录运行 |
| 本文代码基线 | `a3fc19f354f560fc21d33498515ea2462583350d`；之后本文档更新不代表新增模型验收 |
| 产品源码 | [PR #1](https://github.com/Songhonglei/lume-skill/pull/1) 已合并，main 提交 `97a29f3` |
| LumaSkill 品牌 | [PR #2](https://github.com/Songhonglei/lume-skill/pull/2) 已合并，main 提交 `a3fc19f` |
| 最新代码基线 CI | [40080630091](https://github.com/Songhonglei/lume-skill/actions/runs/40080630091)，completed / success |
| 应用版本 | `0.1.0` 开发候选；这个版本号不表示已有正式 Release |
| 开源许可 | 原创代码 MIT；第三方许可保留 |
| 真实评测 | macOS arm64 原生路径通过；目标 Docker 平台仍待真实模型验收 |
| 正式分发 | 没有发布正式 Release、GHCR 镜像或已验收的公开安装资产 |

用户明确决策：先前要求保留候选 PR，后来已改为“先合并到main，我会在其他电脑下载此项目代码继续docker验证”。因此源码合并已完成且有授权，剩余平台验证继续如实保留。不要因旧文档的“发布未放行”误判为源码尚未公开；也不要把源码合并理解为正式镜像已验收。

**旧开发仓库与新合集是两个 Git 仓库。** 原开发目录的平铺仓库仅保存历史实现与本机测试资料，没有配置远端；当前应用已迁入合集子目录，品牌也只在合集更新。旧证据中的 `6e704179…`、`abeebd655…` 是旧仓库提交，不能假定在 GitHub main 中可直接检出。新 Agent 应 clone 合集，并从子目录继续。

## 2. 用户要解决的问题与已冻结边界

面向单管理员、自托管的通用 Skill 评测工作台：上传本地 Skill，维护可复用案例，使用独立 Worker 和 Codex 真实运行，保留版本、结果及原始报告。没有企业内部平台或账号依赖。

主链路：

1. 设置管理员密码，配置 Worker 及可用 Codex 模型。
2. 在 Skills 上传 ZIP 或目录；稳定资源身份与不可变版本分开管理。
3. 已有非空启用集则复用；只有草稿则引导维护；真正无案例时才让用户确认生成或上传。
4. 生成仅创建可编辑草稿；维护、校验、保存、启用后再手动发起评测。
5. 每次固定 Skill、评测集、模型配置与全部案例，查看执行状态、判分与报告；失败重做由用户手动触发。

已确认的产品约束：

- 四页：Skills、评测集管理、评测记录、系统配置。Worker 放在系统配置，不新增独立管理体系。
- `skill-up 0.14.0`，唯一主引擎 `Codex 0.162.1`；标准评测、全部案例，每个案例一种裁判。
- 裁判为 `rule_based`、`script` 或 `agent_judge`；`expect` 是额外门槛。支持三种类型，不表示对一个案例同时投票。
- 同一 Skill 可有多个评测集、一个默认集。草稿可编辑，保存版本不可变，启用指向保存版本。历史任务不随启用版本变化。
- 支持原生包、目录及 evals.json 预览/导入/导出；保留未知字段、附件和脚本，不静默删字段以求通过。
- 生成使用固定的第三方 skill-upper 编写资产，不修改源 Skill、不覆盖当前启用版本、不自动发起评测。
- 一个接入码包含中心地址和单次秘密，**当前实现有效期为 10 分钟**。兑换后 Worker 本机持久保存连接；不要沿用设计稿旧例的 30 分钟。
- 一个 Worker 同时处理一个任务。中断后不自动再次调用模型；重启可补传已保存回执，人工重试保留原 attempt。
- PostgreSQL + 本地内容寻址文件；不新增 Redis、对象存储或复杂调度。
- 实际服务端模型身份没有上游可信证明时显示“未核实”。请求模型名称、CLI 版本均不能代替服务端身份核实。

一期不做：财务专用功能、录制采集、回放、远程业务同步、产品内 Git 发布、多引擎、多裁判投票、自动修复、跨 Skill 共享集、版本对比分析页、多租户/组织权限、MCP 配置或真实外部业务工具配置。Windows 原生支持后置。

## 3. 已完成的实现

| 模块 | 已有能力 | 入口 |
| --- | --- | --- |
| 身份与中心 | 单管理员初始化/会话/换密、scrypt、CSRF/Origin、限速、HMAC 实例密钥 | `backend/auth_routes.py`、`security.py`、`config.py` |
| Skill 与评测集 | ZIP/目录安全导入、稳定身份/去重/同名决策、草稿修订、不可变版本、启用/默认、导出 | `backend/resource_routes.py`、`storage.py`、`validation.py` |
| 任务与历史 | 两类任务共用队列、冻结输入、幂等、取消、手动重试、原始报告下载与隔离预览 | `backend/task_routes.py`、`queue.py` |
| Worker 协议 | 单码接入、内置自动接入、领取/心跳/租约、撤销、事件连续确认、迟到回执、归属复核 | `backend/worker_routes.py`、`settings_routes.py` |
| Worker 执行 | 私有状态/登录目录、固定工具核对、环境白名单、沙箱自检、进程树停止、持久回执 | `worker/__main__.py`、`runtime.py`、`engine.py`、`supervisor.py` |
| 生成与判分 | 固定编写资产、生成草稿、三类单裁判、完整覆盖检查、执行与判分分离 | `worker/generate.py`、`results.py`；中心亦复核结果 |
| 前端 | 四页、案例表单及源码编辑、生成确认、冻结任务确认、状态/日志/报告、模型和 Worker 配置 | `frontend/src/` |
| 部署 | 多阶段 Dockerfile、Compose 首次引导、随机持久秘密、独立 Worker ZIP/安装器、配套备份 | `deploy/`、`Dockerfile`、`compose.yaml` |
| 来源与许可 | 固定上游提交及逐文件摘要、MIT、第三方 notices、公开候选检查 | `vendor/skill-upper/UPSTREAM.json`、`THIRD-PARTY-NOTICES.md` |
| 品牌 | 原创蓝白“光棱 L”、字标、小尺寸 favicon、Apple 图标及应用内副本 | 合集 `assets/brand/`、应用 `frontend/public/` |

### 3.1 数据与执行流

浏览器 → FastAPI → PostgreSQL 资源/版本/任务记录；大文件进入中心的内容寻址文件库。Worker 通过 HTTP 主动领取任务，下载冻结输入，在隔离任务目录调用 skill-up/Codex，回传事件及结果包。中心核对摘要、attempt/lease 归属与预期案例覆盖，再更新任务与报告。Worker 不直接访问 PG 或挂载中心文件库。

`backend/api.py` 创建应用、初始化 schema 并提供前端静态资源；`backend/schema.sql` 定义 v1 schema 和不可变版本触发器。当前没有已验证的跨 schema 版本迁移路径。

执行状态有 `QUEUED / RUNNING / CANCEL_REQUESTED / SUCCEEDED / FAILED / CANCELLED / INTERRUPTED`；判分有 `PASSED / FAILED / INCOMPLETE`。模型正常执行但断言不满足，可以是 `SUCCEEDED + FAILED`。技术错误、报告缺失、预期案例缺失/跳过/重复/无效必须保留为 `INCOMPLETE`，不能因报告文件存在就判通过。

### 3.2 实际 API 导航

以下路径都在 `/api` 下，字段与权限以当前 Pydantic 模型和 routes 为准。设计稿中的分离 `/generations`、`/evaluations` 是早期草案，不能据此另造接口。

| 功能 | 实际入口 |
| --- | --- |
| 健康/登录 | `/health`、`/setup`、`/session`、`/settings/password` |
| Skill | `/skills`、`/skills/import`、`/skills/import-directory`、`/skills/{skill_id}`、`/skill-versions/{version_id}/download` |
| 评测集 | `/sets`、`/skills/{skill_id}/sets`、`/sets/{set_id}`、`/sets/preview-import`、`/sets/preview-import-directory` |
| 草稿/版本 | `/sets/{set_id}/drafts`、`/set-versions/{version_id}`、`/validate`、`/save`、`/export`；后几项接版本路径 |
| 启用/默认 | `/sets/{set_id}/activate`、`/skills/{skill_id}/default-set` |
| 任务 | `/tasks`；`/tasks/{task_id}` 下 detail、events、cancel、retry；生成和评测通过 kind 区分 |
| 报告 | `/artifacts/{artifact_id}/download`、`/artifacts/{artifact_id}/report` |
| 配置/接入 | `/settings`、`/settings/model`、`/workers`、`/workers/{worker_id}/probe`、`/revoke`、`/worker-enrollment-codes` |
| Worker 内部协议 | `/worker/enroll`、`/builtin-enroll`、`/claim`、`/heartbeat`，以及 `/worker/attempts/{attempt_id}/input/{kind}`、`/events`、`/complete`；短路径接 `/worker` 或 attempt 前缀 |

### 3.3 固定依赖与运行边界

- Python 要求 3.11+；本机/CI/镜像基线 3.12.12，独立 Mac 安装曾用 3.13.2 验证。以 `uv.lock`、`deploy/*requirements*.txt` 的锁定/哈希为准。
- Node 本机/CI/镜像 24.19.0；前端前提 Node 22.12+。CI 使用 uv 0.9.11，PG 17.10。
- skill-up 固定 0.14.0，来源 `alibaba/skill-up`，上游提交 `53f6daecf4ac79e4e53ea53f3fe17dac3114debb`。`deploy/toolchain.json` 存官方分平台工具摘要，vendor 有独立逐文件摘要。
- Codex 固定 0.162.1；应用私有安装不覆盖系统工具。不要顺手升级任何固定版本。
- `input.turns` 目前明确拒绝：该上游版本的 Codex resume 路径带沙箱绕过参数，不能静默接受或删掉字段。
- 目标平台：独立 Linux x86_64、macOS arm64；Compose Linux x86_64 和 macOS arm64 Docker Desktop。Podman arm64 记录仅作为补充。
- 单管理员信任自己上传的 Skill/脚本；隔离目录与沙箱不等于不可信多租户的强隔离。

## 4. 验证结论与证据

PASS 仅针对该行记录的环境、源码/安装包和路径；不把旧实测延伸为新版本全平台实测。

| 验证项 | 结论 | 证据与限制 |
| --- | --- | --- |
| 自动测试与静态构建 | PASS | 40 项 PG 测试、Ruff、TS/Vite、源码扫描；[main CI](https://github.com/Songhonglei/lume-skill/actions/runs/40080630091) |
| Linux x86_64 CI 容器 | PASS（无模型路径） | Docker api/worker 构建、空卷初始化、唯一内置 Worker、重启后会话/Worker 身份保持；不含模型凭据或真实推理 |
| 原生三类裁判 | PASS | [three-judges.json](verification/p1/three-judges.json)，各一案例 3/3 |
| 原生生成质量 | PASS | [generated-good.json](verification/p1/generated-good.json)、[generated-bad.json](verification/p1/generated-bad.json)：正常 5/5，预设错误前缀 0/5 |
| 故障不会伪装通过 | PASS | P1 缺登录、错误模型、1 秒超时；技术失败保持不完整 |
| API→独立 Worker | PASS | [e2e.json](verification/local/e2e.json)，真实三类评测及原始产物 |
| 浏览器主链路 | PASS | 无案例上传→取消不创建任务→确认生成 3 案例→维护新增至 4→保存启用 4/4→再次复用同版本 4/4 |
| 原始报告隔离 | PASS | opaque iframe sandbox、CSP、同源 DOM 不可读取，ZIP 可下载 |
| 真实断网恢复 | PASS | [network-faults.json](verification/local/network-faults.json)：20 秒断连恢复 4/4；70 秒超过租约中断，迟到回执不覆盖重试终态，无自动重跑 |
| 原生备份恢复 | PASS | [restore.json](verification/local/restore.json)：新 PG/目录，历史任务、版本、产物摘要和会话保持 |
| Mac 独立 Worker ZIP | PASS（有版本区分） | 旧 ZIP `4f77ebd7…` 安装后真实三类 3/3，见 [packaged-worker-e2e.json](verification/local/packaged-worker-e2e.json) |
| 后续修订 Mac ZIP | PASS（安装/重连） | ZIP `b0b4a7ed…` 新目录安装、源码字节相同、持久接入复用、在线；未为该 ZIP 重跑模型，见 [handoff-checkpoint.json](verification/local/handoff-checkpoint.json) |
| Linux 独立 Worker ZIP | NOT_RUN（安装/真实模型） | 已构建并记录哈希，尚无独立 Linux 机器安装收据 |
| Podman Linux arm64 | PARTIAL / 沙箱阻断 | 构建/引导/非 root/重启/配套恢复通过；Codex 沙箱 devpts 挂载被拒绝，见 [containers.json](verification/local/containers.json) |
| Linux x86_64 Docker 真实推理/生成 | NOT_RUN | CI 成功不覆盖这条；接手优先项 |
| macOS arm64 Docker Desktop 完整路径 | NOT_RUN | 需要目标电脑补齐；Podman 与原生都不能代替 |
| 完整浏览器边缘组合 | PARTIAL | 附件/源码编辑全部交互组合、运行中切换启用版本未逐个浏览器验证；PG 相关机制有测试 |
| 正式镜像/Release/公开资产重装 | NOT_RUN | 工作流已写，未执行发布；AC-32 未整体通过 |

历史包 SHA256：

```text
Mac 修订 ZIP: b0b4a7ed3667d40785fec6142a6b587589e3008be3486007f6bcb77b84967601
Linux 修订 ZIP: f4b76f2026e4c2f406cf703b7ed6512029aad9af45dfed1c94b3d0ed97ddaf6d
Mac 已真实评测旧 ZIP: 4f77ebd7b6cc8266a0baac90963d10ba62dea94044e646b73994556899cb91be
```

这些是历史产物身份。重新从 main 打包后请记录新包哈希，不要求新包与旧包哈希相同。

`verification/local/checks.json` 中 project_subdirectory 保留当时布局快照；当前路径以本文的 `skill-eval/` 为准，不能照抄历史路径部署。

证据优先级：新环境的原始收据与脱敏摘要 → 对应 commit/CI → 当前状态索引 → 历史方案。`checks.json`、`worker-packages.json` 等保留当时的检查点，不改写成后来实测。当前状态以本文、[实现进度](IMPLEMENTATION-STATUS.md)、[验收矩阵](verification/local/acceptance.md) 及新增证据为准。

## 5. 当前最重要的阻断与后续顺序

### P0：在其他电脑完成目标 Docker 真实验收

已有明确故障：Podman rootless Linux arm64 上 bwrap 报 `Can't mount devpts on /newroot/dev/pts: Permission denied`。第一次任务 `1c30e2ec-2c8c-45b3-8f10-3a8919c2af68` 虽然正常结束，三个案例均因无法读取 Skill 而失败。后续加入调用模型前的 Linux 本地读写沙箱自检，人工重试在推理前以 `FAILED + INCOMPLETE` 停止，没有 run_started 事件或新模型调用。

接手后先用真正的 Linux x86_64 Docker 或 Mac Docker Desktop 验证当前默认路径。若仍失败，保留宿主/引擎版本、沙箱日志、任务与 attempt 状态再定位兼容原因。不能用 privileged、SYS_ADMIN、关闭沙箱、挂 Docker socket、挂完整宿主 HOME、自动改引擎/模型来制造“通过”。

完成标准：新环境空卷启动；精确工具版本；登录及模型检查；真实三类案例 3/3；真实生成草稿、维护启用后全量评测；重启与配套备份恢复；缺登录/错误模型/超时诊断；记录 commit、环境、单次模型启动数、结果/报告摘要和剩余限制。不同目标平台分别记结果。

### P1：独立 Linux Worker 与发布准备

1. Linux x86_64 上从当前 main 构建/安装独立 ZIP 到新应用目录，使用新接入码、自己登录，完成三类真实评测和重连。
2. 补 AC-09/12 的浏览器边界组合与端口冲突操作路径；不为了“全绿”重复已通过且未受改动影响的用例。
3. 按 UGLIC → skill-release-audit → 修复/复核 → PR/CI → main 完成必要修改。
4. 目标验收完成后再确认正式版本/镜像发布范围。镜像工作流是手动 `workflow_dispatch`，带 `release` environment；当前没有已发布镜像可直接拉取。
5. 正式发布还需要：来源/许可、版本一致、固定 tag/digest、公开安装说明、公开来源的全新安装、备份恢复与实际平台证据。发布后才可把 AC-32 标整体通过。

### P2：后续整理

合集 README 仅保留必要入口，用户允许晚些丰富。其他 skill 管理/运营项目今后放其他子目录；当前应用目录直接位于合集根目录，应用文件保留在 `skill-eval/` 内。不要在这次接手中无授权扩展一期范围。

## 6. 新电脑最短接手步骤

### 6.1 拉取并确认位置

前提：Git、Docker Engine + Compose v2（Linux）或 Docker Desktop（Mac），能访问镜像、PyPI、npm、GitHub；真实模型另需该电脑可用的 Codex 登录。先确认本机 8765 没被占用、没有要保留的同名 Compose 项目。

```bash
git clone https://github.com/Songhonglei/lume-skill.git
cd lume-skill/skill-eval
git rev-parse --show-toplevel
git rev-parse HEAD
docker version
docker compose version
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

打开 `http://127.0.0.1:8765`，设置管理员密码。内置 Worker 自动接入；在同一容器的模型卷中登录：

```bash
docker compose exec -it worker codex login --device-auth
```

系统配置选择 Worker/连接，填写该连接可用的模型名称，点击“检查连接”。该步骤会真实调用模型。不要把原电脑的 auth.json 或 Worker token 写进仓库、镜像或 GitHub secrets。

沙箱快速定位可用：

```bash
docker compose exec -T worker codex sandbox -- /bin/sh -c 'printf sandbox-ready'
```

此命令不调用模型，只辅助定位。真实任务内的隔离配置与读写自检才是最终依据。固定版本用 `codex sandbox -- <command>`，不要写 `codex sandbox linux`。

上传或从页面添加 `examples/label-text` 合成示例，使用随附三类案例真实运行并检查原始报告。生成路径请用无启用集的独立合成 Skill：确认生成、维护草稿、保存启用、全量评测，再次运行确认复用同一评测集版本。不要覆盖已有个人数据做实验。

### 6.2 可选：复现 CI 的无模型引导检查

以下仅用于**单独的全新验收实例**，不能在已由人设置密码的实例上运行首次检查。脚本会生成随机管理员密码并只保留会话收据；若要继续人工页面验收，使用另一套全新实例或上一节的人工初始化，不要期待能从该收据取回密码。

```bash
uv sync --locked --group dev
uv run --locked python3 deploy/compose_smoke.py --state .local/compose-smoke.json
docker compose down
docker compose up -d --wait
uv run --locked python3 deploy/compose_smoke.py --state .local/compose-smoke.json --verify
```

脚本验证中心、唯一内置 Worker、工具版本与重启后的会话/身份，不调用模型。`.local/compose-smoke.json` 含私人会话，禁止提交。保留卷；真实数据环境不能照搬 CI 清理的 `down --volumes`。

### 6.3 独立 Worker 安装验证

不需要安装中心/PG。前提：Python 3.11+、venv/pip、网络、精确版本 Codex 和可用登录。

```bash
python3 deploy/build_worker.py
```

从 `.local/dist/` 取本平台 ZIP 与 SHA256，在源码目录外校验、解压；进入解压根目录后安装到不存在的新目录：

```bash
python3 deploy/install_worker.py --directory "$HOME/.local/share/skill-eval/app-0.1.0-verify"
"$HOME/.local/share/skill-eval/app-0.1.0-verify/start-worker" \
  --state-dir "$HOME/.local/share/skill-eval/worker-verify" \
  --codex-home "$HOME/.codex"
```

需私有 Codex 时给安装命令增加 `--install-codex`，另需 Node.js 22+、npm。模型配置若依赖环境变量，需要在启动 Worker 的同一终端按自己的连接设置；不从旧机器拷贝秘密。首次粘贴系统配置生成的接入码。远程 Worker 要求中心真实可达且使用 HTTPS；localhost 只适合中心所在机器。升级采用新应用目录，保留原 state-dir 与所选登录目录，避免同时启动相同 state-dir。

### 6.4 开发检查

本机开发先按 [README](../README.md) 准备 PG/依赖。以下测试使用独立测试数据库及每测试独立 schema，不指向生产库：

```bash
uv sync --locked --group dev
createdb skill_eval_test
export OSE_TEST_DATABASE_URL=postgresql://localhost/skill_eval_test
uv run --locked python3 -m pytest -q
uv run --locked ruff check backend worker tests deploy
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
python3 deploy/check_source.py
```

项目目录下使用 `python3 -m pytest`，避免干净 Linux 环境的模块导入问题。普通测试包含合成协议回执，不代表模型已验收；`tests/real_smoke.py` 只在明确需要真实验收时单独运行。仅文档改动不需要重复付费模型调用。

## 7. 部署、数据与恢复注意事项

Compose 服务为 init、db、api、worker，以及仅显式启用的 maintenance/backup。init 短暂以 root 建目录/属主和随机持久秘密，api/worker 以 UID 10001 运行，启用 no-new-privileges；Worker 不挂载中心库或 Docker socket。

六个命名卷：PG 数据；中心文件/instance-key；数据库密码；内置 Worker 种子；Worker 状态；模型登录目录。恢复不能只复制 PG，也不能只带 files.zip。

完整备份点 = 停止中心/Worker 写入后的 PG custom dump + 五个文件 root（center、worker、model、database、builtin）。文件备份拒绝覆盖、非空恢复目标、路径穿越及符号链接，恢复前先核对全部摘要。只允许显式排除可重建的 `model/tmp`，排除记录进 manifest；config.toml、auth.json 和其他持久文件仍保留，其他位置的符号链接仍拒绝。

请严格使用 [OPERATIONS.md](OPERATIONS.md) 的配套命令。恢复到新的空库、空目录/新 Compose 项目；先恢复文件，再启动 init/db、导入 PG，最后启动 api/worker。保持实例密钥与连接资料配套，避免新旧中心同时消费同一 Worker 状态。确认迁移成功前保留旧安装与备份。

当前 v1 尚无跨版本 schema 升级实测。更高 schema 版本会拒绝启动，不能删库绕过。端口变化时同步 PUBLIC_URL；远程初始化需随机 OSE_SETUP_TOKEN、HTTPS 代理及正确可达 URL。

## 8. 品牌资产交接

产品展示名 **LumaSkill**，仓库 slug **lume-skill**，技术包名 `open-skill-eval`、OSE_ 配置前缀保持既有兼容，不批量改名。

“光棱 L”代表光与能力模块：折叠蓝色 L、白色光路、独立菱形模块。主色 `#1754D8`，亮蓝 `#298AFF`，冰蓝 `#D9F1FF`，白色。原参考站只提供视觉方向，未复制参考站素材到仓库。

合集 `assets/brand/` 是源资产：mark/wordmark SVG 与 PNG、简化 favicon SVG/16/32/48 PNG/ICO、Apple 180 图标、preview、许可及来源说明。应用 `frontend/public/` 自带所需副本，支持从子目录独立 Docker 构建。修改源图后同步副本并校验一致，不能让构建依赖合集上级目录。

`frontend/src/App.tsx` 共用 Brand 组件用于登录与工作台；页面标题、图标声明均已更新。浏览器实查了 36px 主标识、32px PNG、三尺寸 ICO、Apple 180，900px 视口无横向溢出。字标 SVG 使用字体回退，固定 PNG 可保持展示；没有分发字体文件或远程字体依赖。

## 9. 经验复盘：哪些做对了，哪里踩过坑

### 9.1 有效做法

先验证固定 CLI 和真实最小案例，再建设中心与页面，使生成、三类裁判、失败语义有实际依据。使用正常/缺陷 Skill 对照，避免“模型给了一个报告”就认定评测有用。协议/进程/数据库测试与真实模型证据分开，既降低费用，也保留结论边界。

资源身份、不可变版本与冻结任务分开后，案例维护与历史追溯可以同时成立。幂等、租约、回执持久化和人工重试共同处理网络异常，避免重复模型调用。包白名单、私有安装、上游摘要与许可清点让开源范围可检查，未把原环境一起带出去。

### 9.2 具体问题与以后怎样避免

| 问题/触发 | 根因与已做修复 | 接手经验 |
| --- | --- | --- |
| 容器空卷首次启动失败 | `Path.chown` 不存在，原生测试未覆盖 root 初始化；改为 `os.chown` | 必测真正空卷，CI 已加入首次引导 |
| 容器健康但真实评测失败 | Podman bwrap 无法挂 devpts；模型只能报告读不到 Skill | 健康检查不能代替推理；先做同环境沙箱读写自检，失败前停止调用模型 |
| 干净 Linux CI 找不到 backend | pytest 可执行入口与 Python 模块路径差异 | 从应用目录运行 `uv run --locked python3 -m pytest -q` |
| Codex 临时 symlink 导致备份失败 | model/tmp/arg0 可重建链接被安全检查拒绝 | 只显式排除 model/tmp 并记 manifest，不全面放开符号链接 |
| 父工作区指令/仓库影响执行 | 上游 CLI 会探测父 Git/AGENTS，可能建立基线提交 | 新任务目录、隔离 HOME/config、Git ceiling、project_doc_max_bytes=0；不继承宿主整套配置 |
| 取消后有模型后代进程残留 | 子进程可能自行建进程组，单杀组不够 | PID 身份快照、进程树终止与租约守护同时保留，相关测试已有覆盖 |
| 事件确认后尾部日志遗漏风险 | 连续 ack 与任务结束 flush 的顺序需一致 | 先耗尽待发事件，再 flush 剩余日志；不要只看任务最终状态 |
| 缺案例/跳过案例误判风险 | 只看总报告 success 无法证明全量执行 | 以冻结预期清单检查唯一、有效、完整覆盖，中心再次核对 |
| 保存后选回旧草稿、跨页列表旧 | 旧请求返回覆盖新选择；刷新依赖不足 | 当前版本选择与列表更新协调；浏览器验证不能只用后端测试替代 |
| 导入 notes 显示异常 | 转换 notes 是结构化对象，不是纯文本 | 保留结构并正确展示；不通过丢字段来简化 UI |
| 直接支持 input.turns 会破坏沙箱约束 | 上游 resume 路径固定携带绕过参数 | 当前字段级拒绝，升级前独立验证上游行为 |
| 系统工具与项目版本不同 | 全局 skill-up 0.10.0，项目需 0.14.0 | 私有工具安装并验证精确版本，不覆盖全局 |
| 从平铺仓库迁入合集后路径变化 | workflow 必须在根目录，但构建/lock 位于子目录 | 同步 working-directory、npm cache 路径、Docker context、镜像命名；应用文件保留在根目录下的 skill-eval/ 内 |
| 检查器大量文件不存在提示 | 多为文档描述的运行产物；但也发现真实缺失引用 | 补齐同提交的 4 份 references；保留运行产物等误报依据，不制造假文件 |
| 状态文档落后于合并/CI | 原始收据与当前状态没有分层 | 原始收据不重写，新检查点与当前索引单独更新；源码合并、平台通过、正式发布分开表述 |

Docker Hub 网络问题曾使用同版本官方 ECR 镜像本地标记、Podman `--pull=never` 构建来排障。那只是当时环境的办法，不是已验证的 Docker Desktop 安装方式。浏览器工具会话也曾中断；不要凭构建通过补写浏览器 PASS，更不要为了恢复会话擅自升级工具或反复新建任务空间。

### 9.3 下一阶段应改进的节奏

最早就准备目标 Docker 环境，让空卷、沙箱读写、真实模型最小案例成为第一批验收。每个阶段同时写清 commit、环境、结果与未测分支；收到“先合 main”的范围变更后同步状态索引。优先补可用性证据，保持一期主链路简洁，不因审计或交接把方案复杂化。

## 10. 审计、协作与发布规则

用户偏好：默认中文、先结果、简洁；进度标题用图标 + 2–7 个中文字符。交互遵循“最急、最少、最像”，文案“简单、省心、说人话”。使用 `python3`，查找优先 `rg`；延续明确授权，常规可逆操作直接完成，缺关键环境时集中澄清。不要创建其他聊天、主动派子 Agent 或向其他人发消息，除非获得相应授权。

用户全局发布流程：**glic-check 的 UGLIC 模式 → skill-release-audit → 修复所有非误报并复核 → 推送对应 GitHub repo → 合入 main**。用户已授权必要修复，不需为审计工具“先询问”模板重复要许可。实际问题/必要检查未过不能跳过合并；误报保留依据，不为消警改坏有效实现。

应用本身不是 Skill，根目录没有 SKILL.md：skill-release-audit 的 NotSkill/exit 2 对根目录记录 N/A，不能伪造根 Skill 包装。对真正随附的 `vendor/skill-upper`、`examples/label-text` 跑六模块。此前结果分别 0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN；人工确认这些残留不构成实际缺陷。依据见 [skill-release-audit.md](verification/local/audit/skill-release-audit.md) 及原始 JSON：

- vendor 17 条为运行输入/输出名称而非包内缺文件；1 条 TODO 是注释规则示例。
- 合成示例 3 条为篇幅/description 建议，简短约定已完整且真实正反例通过。
- 原先真实缺失的 install/observations/migrate-anthropic/cli 四份 references 已从相同上游补齐；逐文件摘要已更新。

`deploy/check_source.py` 检查应用子目录的私人路径、内部端点、凭据形状、运行文件、版本和 vendor 摘要。**合集根目录资产、workflow、文档若有改动须另外检查**，不能声称应用扫描器覆盖整个合集。`.env`、auth.json、connection.json、instance-key、数据库备份、完整日志、模型 profile/Worker state 不进入 Git。

已有审计：[UGLIC](verification/local/audit/UGLIC.md)、[容器增量](verification/local/audit/UGLIC-container.md)、[品牌增量](verification/local/audit/UGLIC-brand.md)。本轮交接检查见 [UGLIC-handoff.md](verification/local/audit/UGLIC-handoff.md)。远程 PR/CI 是代码检查；正式模型与平台验收另记。

## 11. 接手第一小时清单

1. clone 合集，确认 `skill-eval/` 与当前 SHA；阅读本文、README、OPERATIONS、验收矩阵。
2. 查明本机 OS/架构、Docker/Compose 版本、端口占用及是否有现存数据；只使用自己的新验收实例。
3. 按第 6 节构建/引导，检查固定工具与沙箱；失败先记日志，不先改权限或模型。
4. 登录后完成一次合成三类案例，再确认生成与复用路径；记任务、attempt、报告与冻结版本。
5. 写新环境证据及剩余限制，按优先级继续恢复/独立 Worker 验收。若环境仍不可用，交付具体阻断与下一步，不把未跑项写成通过。

## 12. 可直接交给下一位 Agent 的指令

```text
请接手 Songhonglei/lume-skill 的 skill-eval 项目。先读 docs/AGENT-HANDOFF.md、README.md、docs/OPERATIONS.md 和 docs/verification/local/acceptance.md，再检查当前 main 与本机环境。

项目已完成四页、自托管中心、独立 Worker、固定 skill-up 0.14.0/Codex 0.162.1、本机真实评测和 LumaSkill 蓝白标识；PR #1/#2 已合并，代码基线 a3fc19f 的 CI 已通过。请在当前源码上继续，不重做产品方案、不扩大一期范围、不覆盖系统工具或个人数据。

优先完成此电脑的 Docker 真实验收：空卷引导、沙箱、自己登录/模型检查、三类合成案例、生成草稿维护启用后全量评测及复用、重启和配套备份恢复。Podman arm64 曾因 devpts 挂载被拒绝，不能以关闭沙箱、提权或挂宿主 HOME/socket 绕过。CI 启动通过不代表模型已验收。

每项记录当前 commit、OS/架构/引擎版本、结果和脱敏证据；真实收据保留本地，秘密不能进 Git。历史证据不改写为新实测。需要代码修复时按 UGLIC→skill-release-audit→修复/复核→PR/CI→main 的已授权流程执行。源码合并已获授权，正式镜像/Release 仍待目标验收与发布范围确认。默认中文，先结果，少打扰。
```

## 13. 阅读顺序与资料位置

1. 本文与 [项目 README](../README.md)：当前结论与最短开始。
2. [OPERATIONS](OPERATIONS.md)、[WORKER](WORKER.md)：配置、接入、安装、备份恢复与排障。
3. [实现进度](IMPLEMENTATION-STATUS.md)、[验收矩阵](verification/local/acceptance.md)、[证据索引](verification/local/README.md)：覆盖与缺口。
4. [方案基线](PRODUCT-AND-TECHNICAL-PLAN.md)、[开发计划](DEVELOPMENT-PLAN.md)、[验收标准](ACCEPTANCE-CRITERIA.md)：需求追溯；历史设计示意以当前实现说明为准。
5. [来源清单](SOURCE-INVENTORY.md)、[第三方许可](../THIRD-PARTY-NOTICES.md)、审计目录：来源和误报判断依据。

原电脑的绝对路径、当前进程/服务观察、私人收据/备份和凭据文件位置另存于**本地交接附录**，不在公开仓库。新电脑复现无需获得这些秘密。需要迁移旧数据时由用户通过受控方式提供配套备份；仅下载 GitHub 代码不会获得旧管理员密码、历史数据库或模型登录。
