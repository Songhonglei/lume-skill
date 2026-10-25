# Open Skill Manager

自托管 Skill 工作台。当前开发版本 **0.3.2.dev2**，历史验收基线 **0.3.1**：注册与不可变版本、独立 worker、真实模型审计、授权修复、独立复审、新版本登记与任务中心。Python 3.11+，SQLite + 本地文件，无内部平台依赖。

注册 → 审计 → 选择问题并授权修复 → 独立全量复审 → 登记新版本 → 下载已接通。原版本保持不变；静态预检不会冒充完整 PASS。

## 获取源码

```bash
git clone https://github.com/Songhonglei/lume-skill.git
cd lume-skill/skill-manage
```

后续安装、开发与 Compose 命令均在 `skill-manage/` 内执行。本项目独立使用 MIT 许可证，见 [LICENSE](LICENSE)。公共包源与镜像尚未发布。

目标隐私：已补充 [T01 凭据检测与阻断](docs/TARGET-PRIVACY.md)。发现疑似凭据（包括示例值）时仅生成待复核证据，阻断外部模型、候选修改和自动登记；先在本地检查并处理，再导入新版本。自动检测有明确格式边界，不能代替导入前的人工脱敏。

## 原生安装

支持 Python 3.11+、Linux / macOS。不需要 Docker；Windows 可使用 WSL2。

```bash
# 在本项目目录安装源码（包尚未发布到公共包源）
uv tool install .
# 或：pipx install .
skill-mng setup
skill-mng start
```

默认访问 [本地工作台](http://127.0.0.1:8765)，数据在 `~/.local/share/skill-mng`。`setup` 隐藏输入密码，重复执行不会重置账号。先运行 `start` 也可以：从数据目录 `run/setup-code` 读取一次性凭据，在网页完成管理员设置。凭据不会自动打印到日志。

```bash
skill-mng status
skill-mng doctor
skill-mng logs --lines 50
skill-mng stop
# 指定目录时，每条命令均传 --data-dir，或统一设置 SKILL_MNG_DATA
skill-mng --data-dir /absolute/path/to/data setup
skill-mng --data-dir /absolute/path/to/data start
```

安装 wheel：`uv tool install /absolute/path/open_skill_mng-0.3.1-py3-none-any.whl`。开发：`uv sync --extra dev`，`uv run pytest`。发行物构建：`uv build`。

## Docker Compose

```bash
docker compose up --build -d
docker compose exec web cat /data/run/setup-code
```

打开 [本地工作台](http://127.0.0.1:8765)，用该凭据创建管理员。持久数据在命名卷 `skill-data`，默认端口仅绑定宿主机回环地址。再次启动保留原账号与包。停止用 `docker compose down`；不要加 `-v`，它会删除数据卷。

Compose 默认启动 Web 和独立 worker，自动配对。`skill-data` 存数据库/原包/模型配置，`worker-data` 存执行缓存，`worker-link` 只共享机器凭据；worker 不挂载 SQLite。端口冲突可设 `SKILL_MNG_PORT=另一个端口`。基础镜像默认 Docker Hub；网络不通时可用公开镜像副本构建：

```bash
docker compose build --build-arg PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.12-slim
docker compose up -d
```

## 使用

1. 登录后点击「导入 Skill」，选择 ZIP、本地目录或公开 ZIP 下载链接。包根目录或唯一顶层目录需包含 `SKILL.md`。
2. 自动读取 YAML 头的 `name`、`description`、`version`；缺少名称或版本时再补填。名称使用小写字母、数字、连字符。
3. 查看包内文件和两个 SHA-256。下载保留上传 ZIP 的原始字节；目录上传生成 ZIP。
4. 同 Skill 同版本同内容复用已有记录；同版本异内容拒绝覆盖。新登记版本不会自动替换当前版本，可在详情中切换。
5. 管理员在设置中添加成员。共享库对已登录成员可读，写入仅限所属维护者或管理员；管理员可调整维护者、停用成员。

公开 URL 每一跳都校验公网地址，并将实际连接固定到已校验 IP；只允许 HTTP(S) 的 80/443 端口，无私有凭据、代理或内网下载。ZIP 上限 16 MiB、解压内容 32 MiB、单文件 4 MiB、最多 500 文件。禁止越界路径、符号链接、特殊文件、重复路径和加密包。平台从不执行上传包的脚本。

## 模型与审计

管理员打开「设置 → 模型服务」，填写兼容 `/chat/completions` 的 API Base URL、模型名及可选 API Key，保存后点击「检测能力」。检测真实发出两次请求，分别验证工具调用和严格 JSON schema 输出。审计实际运行时先强制读取证据，再输出结构化结论；必要规则未决时显示待复核。检测通过才会激活等待配置的完整审计。密钥保存在数据目录 `model-config.json`（600），不发给 worker、不进入目标包、报告或诊断。切换服务地址时需重新填密钥。

也可在本机终端隐藏输入：

```bash
skill-mng model configure --base-url https://your-service.example/v1 --model your-model
skill-mng model check
skill-mng model status
```

无鉴权服务可用 `--no-key`；自动化可用 `--key-file /absolute/key-file`（600）。`setup` 也支持 `--model-base-url`、`--model-name`、`--model-key-file` 和 `--check-model`；不传则保留已有设置。模型 Key 不应写入命令行参数。

在 Skill 详情选择版本后点「创建审计」。L1/L2 共用通用 117/120 分规则；完整 PASS 必须 >=90、零 ERR、所有必要规则/文本证据完成。静态预检无需模型，可能给出已确认 FAIL，否则待复核。任务中心可停止、查执行记录、查看 findings、下载 Markdown/JSON、复制修复提示，或选择明确问题后授权自动修复。

## 授权修复与新版本

1. 打开已保存的审计报告，勾选需要修复的问题。ERR 默认选中；待复核问题需先确认，不能直接自动修改。
2. 点击「修复所选问题」，确认新版本、文件范围及最多 1–3 轮。默认只允许修改所选问题所在文件，另允许自动调整版本声明；额外文件需显式加入。
3. 可选择「复审通过后登记新版本」或仅生成候选；是否设为当前版本单独选择，默认保留原指针。
4. worker 在内存候选中使用固定读写工具，不执行目标脚本或测试。每轮先调整版本，再做固定检查和全新模型会话的全量复审；同时核对修改范围与未选问题。
5. 只有完整 PASS、零 ERR、所选规则已清、范围复核通过、报告已保存、候选摘要和版本基线未变，服务端才在同一事务登记版本与最终报告。相同提交/登记幂等。

复审未决、未授权的新问题、模型预算耗尽或版本冲突会转为待处理，候选不会自动发布。候选只读下载不等于审计通过。已就绪的「仅候选」任务可在详情中手动登记，仍需通过相同门禁。

任务详情提供阶段、轮次、逐文件差异、剩余问题、报告与候选/新版本下载。停止后拒收迟到结果；恢复冻结的候选/复审报告时不重新评分。原包始终保留。模型每轮编辑/复审各最多 16 次调用，总共最多 3 轮、96 次、900 秒。

合成练习包：[repair-demo](examples/repair-demo/SKILL.md) 故意包含短 description 和一处 Python 语法错误，用于演示审计与修复；不要直接执行该脚本。

## 外接 worker

管理员在设置中生成 10 分钟一次码。在另一台可信机器安装相同版本后：

```bash
skill-mng --data-dir /absolute/worker-data worker join --server https://skills.example.com
skill-mng --data-dir /absolute/worker-data worker start
skill-mng --data-dir /absolute/worker-data worker status
skill-mng --data-dir /absolute/worker-data worker logs
skill-mng --data-dir /absolute/worker-data worker stop
```

一次码隐藏输入；自动化使用 `--code-stdin`，不放入参数。非本机地址必须 HTTPS。凭据不等于管理员账号。已接入目录须显式 `--replace` 才可替换；先在平台撤销旧机器。兑换回执丢失时查看设置中的「已消费 / 等待上线」登记，撤销该机器后生成新码，不重用旧码。

默认全平台并发 1，租约 30 秒、心跳 5 秒，最多 3 次 attempt；仅网络/模型临时故障有限重试。撤销/取消/租约换代后拒收旧结果。worker 不访问服务器文件系统或数据库；只下载固定包并用受限工具读文件，不执行目标代码。冻结报告重传不重新评分。

内置独立 Skill 在 `src/skill_mng/resources/skills/skill-deep-audit`；整目录复制到 Agent 的 skills 目录即可独立使用，静态检查仅依赖 Python 标准库。完整语义审计仍需 Agent。详见其 SKILL.md。

## 运维

```bash
skill-mng backup /absolute/path/backup.zip
skill-mng --data-dir /absolute/path/new-empty-data restore /absolute/path/backup.zip
skill-mng --data-dir /absolute/path/new-empty-data doctor
skill-mng --data-dir /absolute/path/new-empty-data start
```

备份使用 SQLite backup API 和包写入锁，包含数据库与不可变原包。恢复仅允许空目录，校验清单、摘要、数据库和引用关系，恢复后旧会话、接入码与机器凭据失效，未完成任务取消。备份包含报告和密码散列，但不包含模型 Key 或 worker 本地缓存；恢复后重新配置模型并接入机器。备份含密码散列，按敏感文件妥善保管。不要手工复制运行中的单个数据库文件。升级前先备份，不能用旧程序打开更高版本数据库。

使用本地磁盘存储 SQLite WAL，禁止多个 Web 进程共享同一数据目录。原生 CLI 使用文件锁和 PID 身份核验防止重复启动或误杀。前台运行：`skill-mng server run`；由 systemd 或容器托管时用其启停命令管理，CLI `stop` 只管理 CLI 后台启动的进程。

配置文件 `config.json` 仅含 `host` / `port`。共享访问时通过 HTTPS 反向代理，并保留 Host；ASGI 服务不信任任意转发头。设置 `SKILL_MNG_PUBLIC_URL=https://你的域名` 可启用正确的 Origin 校验和 Secure cookie（详见 [部署说明](docs/OPERATIONS.md)）。

## 设计与验证

- [项目交接与经验复盘](docs/HANDOFF.md)
- [开发计划及阶段状态](docs/DEVELOPMENT-PLAN.md)
- [领域与 API 契约](docs/contracts/REGISTRY.md)
- [来源与提取边界](docs/SOURCES.md)
- [验收证据](docs/VALIDATION.md)
- [固定样例、批量回归与人工复核](docs/REGRESSION.md)
- [项目专用 CI 与源码/产物清单](docs/CI.md)
- [合成示例](examples/hello-skill/SKILL.md)

全部业务代码在本仓库重新实现，无原项目业务数据或历史 Git。内置审计 Skill 保留 MIT 许可证与固定来源，详见 [能力迁移清单](docs/AUDIT-CAPABILITY-MAP.md)。
