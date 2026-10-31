# LumaSkill · Skill Eval

自托管的通用 Skill 评测工作台。上传本地 Skill，维护可复用的评测集，由独立 Worker 使用 Codex 执行真实评测。

2026-10-31 增量：加强生成案例对实际输入、空字符串、完整断言和附件隔离的要求，增加启用前审查清单与正反例，明确区分结构校验和案例质量。[案例审查指南](docs/CASE-REVIEW.md)。

2026-10-28 增量：[浏览器边界与运行快照验收](docs/verification/local/browser-boundaries-2026-10-28.md)。修复跨页丢附件、批内同名覆盖和详情等待原因缺失；后端 46 / 前端 23 项通过。旧任务冻结、新任务切新版、新 Skill 复用旧案例及会话/离线恢复有新证据。Linux x86_64 继续暂缓。

**源码已合入并推送 main，当前为 0.1.0 开发候选。** 本轮功能提交 78e4527、整合基线 bca9c23；[main CI 40203314300](https://github.com/Songhonglei/lume-skill/actions/runs/40203314300) 已通过。阶段进展与后续优先级见 [实现进度](docs/IMPLEMENTATION-STATUS.md)。

Docker Desktop 原生 ARM64 已通过 Pro 独立登录的真实模型连接、三类裁判 3/3、生成 3 个案例、维护启用复用和配套恢复。原生成案例复跑 2/3 的结果保留；只明确空文本输入后的保存版本连续两次 3/3，错误前缀 Skill 为 0/3，正确判错。详见 [Pro Docker 实测](docs/verification/local/pro-docker-e2e-2026-10-25.md)。

用户已暂缓原生 Linux x86_64 验证，保留 NOT_RUN/PARTIAL，不作为本轮源码合并阻塞。amd64 模拟路径的 seccomp EINVAL 和 Podman 历史沙箱故障没有由 ARM64 结果解除。正式 Release/GHCR 尚未发布；当前继续收敛剩余操作边界与发布候选；案例质量审查方式见上述指南。

固定使用 **skill-up 0.14.0 + Codex CLI 0.162.1**，仅提供标准评测、全部案例、单裁判。没有内部平台或企业账号依赖。

## 开始使用

### 源码部署候选

在合集仓库中先进入 `skill-eval/`。前提：Docker Engine + Compose v2，或 macOS Docker Desktop；能访问镜像、PyPI、npm 和 GitHub。

```bash
docker compose up -d --build
```

打开 [本机工作台](http://127.0.0.1:8765)，设置管理员密码。数据库、实例密钥与内置 Worker 接入自动初始化。当前源码使用有限 seccomp 配置，并在 Docker Desktop 原生 arm64 通过真实模型验证；Podman 的历史 devpts 故障与原生 Linux x86_64 的未验收状态仍单独保留，不保证任意宿主内核均可运行。

在内置 Worker 的独立凭据卷中登录 Codex：

```bash
docker compose exec -it worker codex login --device-auth
```

登录后，在“系统配置”选择 Worker 连接并填写可用模型名称；点击“检查连接”才会发起真实模型请求。上传 Skill 或添加合成示例，即可维护案例和发起评测。容器不挂载宿主机 HOME、Docker socket 或中心文件库。

### 本机开发

前提：Python 3.11+（验证版本 3.12.12）、uv、Node.js 22.12+（验证版本 24.19.0）、PostgreSQL 17、Codex 0.162.1 与可用模型登录。

```bash
uv sync --locked --group dev
python3 deploy/install_tools.py
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
createdb skill_eval
export OSE_DATABASE_URL=postgresql://localhost/skill_eval
export OSE_DATA_DIR=data
uv run --locked uvicorn backend.api:app --host 127.0.0.1 --port 8765
```

另开终端启动 Worker，在系统配置生成接入码后粘贴：

```bash
uv run --locked python3 -m worker --skill-up .local/bin/skill-up
```

默认读取当前用户选择的 Codex 登录目录；可用 `--codex-home` 明确指定独立目录。不会替换全局 skill-up 或 Codex。详细参数见[配置与排障](docs/OPERATIONS.md)。

## 日常流程

1. **Skills**：上传 ZIP 或目录，选择 Skill 版本和评测集。
2. **评测集管理**：导入原生包、目录或 evals.json；编辑案例、断言、脚本和附件，校验后保存并启用。
3. **评测记录**：查看全部冻结案例、执行状态、结论与原始报告；取消任务或手动重试。
4. **系统配置**：集中管理模型、Worker、单次接入码和管理员密码。

已有启用案例时直接复用；只有草稿时先处理草稿；无案例时确认生成或上传。生成只保存新草稿，不修改 Skill、不覆盖启用版本、不自动评测。启用前按[审查清单](docs/CASE-REVIEW.md)逐案核对，结构校验通过不代表质量已确认。每次评测固定输入版本，历史报告继续引用原快照。

## 独立 Worker

支持目标为 Linux x86_64 与 macOS arm64；macOS 安装已验证，Linux 待验收。运行 Worker 不需要安装中心或数据库。

```bash
python3 deploy/build_worker.py
```

从 `.local/dist/` 取得对应平台的版本化 ZIP 和 SHA256，校验并解压后执行：

```bash
python3 deploy/install_worker.py --directory "$HOME/.local/share/skill-eval/app-0.1.0"
"$HOME/.local/share/skill-eval/app-0.1.0/start-worker"
```

安装目录需要是新目录，安装依赖需要联网。前提为 Python 3.11+、可用 venv/pip、Codex 0.162.1 和模型登录；需要私有 Codex 时增加 `--install-codex`（另需 Node.js 22+ 与 npm）。安装到应用私有目录，保留系统版本。首次启动输入一个接入码，以后自动重连。

## 验证与边界

```bash
createdb skill_eval_test
export OSE_TEST_DATABASE_URL=postgresql://localhost/skill_eval_test
uv run --locked python3 -m pytest -q
uv run --locked ruff check backend worker tests deploy
npm --prefix frontend test
npm --prefix frontend run build
```

真实模型测试需要显式运行 `tests/real_smoke.py`；普通测试使用隔离 PG schema 和合成协议回执，不冒充模型验收。模型请求可能产生费用。已验证的真实调用、摘要和限制见[兼容记录](docs/COMPATIBILITY.md)。

一期面向单管理员自用。任务目录、环境变量白名单和 Codex 沙箱用于减少无关上下文；它们不构成不可信多租户的强隔离。仅运行你信任的 Skill、脚本和附件。实际服务端模型身份无法从上游报告核实时，页面显示“未核实”。

## 文档

- [完整 Agent 交接：进展、复盘、接手步骤与待办](docs/AGENT-HANDOFF.md)

- [配置、升级、备份恢复与排障](docs/OPERATIONS.md)
- [产品与技术方案](docs/PRODUCT-AND-TECHNICAL-PLAN.md) · [开发计划](docs/DEVELOPMENT-PLAN.md) · [实现进度](docs/IMPLEMENTATION-STATUS.md)
- [验收标准](docs/ACCEPTANCE-CRITERIA.md) · [本机验收证据](docs/verification/local/README.md)
- [来源清单](docs/SOURCE-INVENTORY.md) · [第三方许可](THIRD-PARTY-NOTICES.md)

原创代码采用 [MIT](LICENSE)，第三方许可见 notices。项目位于 [lume-skill](https://github.com/Songhonglei/lume-skill) 的 `skill-eval/`；合集源码的候选 PR 与正式发布分别记录。未完成的平台验收不因源码公开而变成通过，当前不发布正式版本或预构建镜像。

不包含录制采集、回放、远程同步、企业平台、多引擎、多裁判、跨 Skill 共享和角色体系。
