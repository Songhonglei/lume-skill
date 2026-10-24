# LumaSkill · Skill Eval

自托管的通用 Skill 评测工作台。上传本地 Skill，维护可复用的评测集，由独立 Worker 使用 Codex 执行真实评测。

**当前为本机已验证的开发候选。** macOS arm64 已完成真实生成、三类单裁判评测、网页维护闭环和备份恢复；Podman Linux arm64 的引导、重启和恢复已验证，容器内 Codex 沙箱未通过；Linux x86_64、Docker Desktop 与正式发布仍待验收。完整状态见[验收记录](docs/verification/local/README.md)。

固定使用 **skill-up 0.14.0 + Codex CLI 0.162.1**，仅提供标准评测、全部案例、单裁判。没有内部平台或企业账号依赖。

## 开始使用

### 源码部署候选

在合集仓库中先进入 `projects/skill-eval/`。前提：Docker Engine + Compose v2，或 macOS Docker Desktop；能访问镜像、PyPI、npm 和 GitHub。

```bash
docker compose up -d --build
```

打开 [本机工作台](http://127.0.0.1:8765)，设置管理员密码。数据库、实例密钥与内置 Worker 接入自动初始化。**容器首次引导已在 Podman arm64 验证，但该环境的 Codex 沙箱无法挂载 devpts，真实评测尚未通过。** 请优先使用下方已验证的本机 Worker 路径；不要据此将整套 Docker 部署当成已验收。

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

已有启用案例时直接复用；只有草稿时先处理草稿；无案例时确认生成或上传。生成只保存新草稿，不修改 Skill、不覆盖启用版本、不自动评测。每次评测固定输入版本，历史报告继续引用原快照。

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
npm --prefix frontend run build
```

真实模型测试需要显式运行 `tests/real_smoke.py`；普通测试使用隔离 PG schema 和合成协议回执，不冒充模型验收。模型请求可能产生费用。已验证的真实调用、摘要和限制见[兼容记录](docs/COMPATIBILITY.md)。

一期面向单管理员自用。任务目录、环境变量白名单和 Codex 沙箱用于减少无关上下文；它们不构成不可信多租户的强隔离。仅运行你信任的 Skill、脚本和附件。实际服务端模型身份无法从上游报告核实时，页面显示“未核实”。

## 文档

- [配置、升级、备份恢复与排障](docs/OPERATIONS.md)
- [产品与技术方案](docs/PRODUCT-AND-TECHNICAL-PLAN.md) · [开发计划](docs/DEVELOPMENT-PLAN.md) · [实现进度](docs/IMPLEMENTATION-STATUS.md)
- [验收标准](docs/ACCEPTANCE-CRITERIA.md) · [本机验收证据](docs/verification/local/README.md)
- [来源清单](docs/SOURCE-INVENTORY.md) · [第三方许可](THIRD-PARTY-NOTICES.md)

原创代码采用 [MIT](LICENSE)，第三方许可见 notices。项目位于 [lume-skill](https://github.com/Songhonglei/lume-skill) 的 `projects/skill-eval/`；合集源码的候选 PR 与正式发布分别记录。未完成的平台验收不因源码公开而变成通过，当前不发布正式版本或预构建镜像。

不包含录制采集、回放、远程同步、企业平台、多引擎、多裁判、跨 Skill 共享和角色体系。
