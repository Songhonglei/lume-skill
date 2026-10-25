# 配置与运维

当前为 0.1.0 开发候选；本机路径已验证。2026-10-25 新增 Docker Desktop arm64 的空卷引导、重启与沙箱正反检查，以及 amd64 模拟环境中的独立 Worker 安装/接入验证；真实模型与原生 Linux x86_64 仍待验收。历史 Podman 的沙箱失败和恢复证据保留。详见 [Docker 与 Worker 增量](verification/local/docker-worker-2026-10-25.md)。默认仅监听本机，不连接内部服务。

## 配置

中心读取 `OSE_` 环境变量。除 PostgreSQL 连接外，常规模型与评测操作均在网页完成。

| 参数 | 默认值 / 说明 |
| --- | --- |
| OSE_DATABASE_URL | postgresql://localhost:5432/skill_eval；Compose 从专用密码卷读取 |
| OSE_DATA_DIR | data；保存不可变文件库和实例密钥，必须持久化 |
| OSE_PUBLIC_URL | http://127.0.0.1:8765；浏览器与独立 Worker 可达的完整源地址，无路径 |
| OSE_SKILL_UP | .local/bin/skill-up；精确版本 0.14.0 |
| OSE_SETUP_TOKEN | 默认空；远程首次初始化必须设置随机口令 |
| OSE_BUILTIN_SECRET_FILE | 默认不启用；Compose 使用专用种子卷自动接入 |
| OSE_LEASE_SECONDS | 60；30–3600 秒，过期标为中断，不自动重跑 |
| OSE_HEARTBEAT_SECONDS | 10；1–60 秒，需小于租约时长的一半 |
| OSE_SESSION_HOURS | 24；1–720 小时 |
| OSE_DEV_ORIGIN | 默认空；仅开发时增加一个允许的浏览器源 |

Compose 额外读取 `OSE_BIND_ADDRESS`（127.0.0.1）、`OSE_PORT`（8765）和 `OSE_BACKUP_DIR`（./backups）。修改端口时同步修改 PUBLIC_URL。`.env.example` 是可复制的本机默认值；不要提交含真实口令的 `.env`。

远程部署需要反向代理提供 HTTPS，PUBLIC_URL 使用真实 HTTPS 地址，设置初始化口令并按需调整监听地址。不要让 8765 端口绕过 HTTPS 代理直接对外开放。API 不信任外部传入的代理来源头；登录限速按实际连接来源，反向代理下可能共用一个限额。远程 Worker 的接入码必须包含它可访问的中心地址，localhost 只适合中心所在机器。

上传压缩包最多 100 MiB，解压最多 500 MiB、10,000 个文件；请求体额外保留少量 multipart 开销。当前上限固定，不截断内容。案例默认 300 秒，语义裁判默认 180 秒；显式值需为 1–86400 秒。生成任务最多 900 秒。

## Worker

```bash
python3 -m worker --help
```

| 参数 | 行为 |
| --- | --- |
| --state-dir | 默认为 ~/.local/share/open-skill-eval-worker；保存连接与待回传回执，不同运行实例使用不同目录 |
| --codex-home | 默认 CODEX_HOME 或 ~/.codex；只选取当前连接与登录，不复制其他 Skill、MCP、hooks、历史 |
| --skill-up | 随附安装目录优先，否则使用项目 .local/bin/skill-up |
| --assets | 默认随附 vendor/skill-upper；固定的案例编写指令资产 |
| --once | 领取并完成一个任务，或确认没有可领任务后退出；用于诊断 |

模型凭据在 Worker 本机保管，中心只接收连接指纹与状态。使用独立 Codex 目录时，在同一目录登录，例如 `CODEX_HOME=/path/to/profile codex login`。容器通过 `docker compose exec -it worker codex login --device-auth` 登录，原始凭据留在 model-home 卷。

一个 Worker 同时执行一个任务；同一 state-dir 防止重复启动。Ctrl+C 或 SIGTERM 停止当前执行并保存可回传诊断；进程被强杀后守护进程在租约过期时停止模型子进程。重启只处理回执，不重新调用模型。网络恢复后继续心跳或回传，过期结果只保留为迟到诊断。需要重做时在页面手动重试，保留原 attempt。

中心拒绝失效或已撤销的接入时，Worker 显示重新接入提示并以非零状态退出，包括 `--once` 诊断模式；不会将鉴权失败作为一次成功检查。

Compose 的 Worker 使用固定来源的有限 seccomp 配置，并同时移除全部 capabilities、保持非 root 与 `no-new-privileges`。配置允许 Bubblewrap 创建自身的用户/挂载命名空间，其他未列出的系统调用仍默认拒绝；来源和摘要在 `deploy/worker-seccomp.SOURCE.json`。不要替换为 `seccomp=unconfined`、增加 `SYS_ADMIN` 或关闭 Codex 沙箱。Linux 宿主的 AppArmor、用户命名空间设置仍可能另外限制执行，需在实际目标机自检，不自动更改宿主安全策略。

用户选择的 Codex 登录通过隔离副本供任务使用。登录过期、被撤销或服务要求重新认证时，在 Worker 的所选目录重新登录。不要把包含 Worker 连接凭据、模型登录或任务临时目录的文件打入 Skill 包。

## 升级

先等任务结束并备份，再停止 Worker 与中心，切换到新版本目录。使用锁文件安装依赖，数据库启动时迁移；遇到高于程序支持的 schema 版本立即停止，不覆盖已有数据。当前只支持初始 schema v1，不存在可宣称已验证的跨版本升级。

Compose 候选流程：

```bash
docker compose stop worker api
docker compose build api worker
docker compose up -d
```

保留所有命名卷；不要运行 `docker compose down -v`。独立 Worker 安装到新应用目录，启动时继续使用原 `--state-dir` 和 `--codex-home`；不直接覆盖旧安装。

## 配套备份

备份包含敏感凭据，保存在仅自己可读的位置，不上传到源码仓库。先停止写入者，PG dump 和文件卷属于同一个备份点。文件脚本会拒绝覆盖现有备份、符号链接和非空恢复目标，并在恢复写入前核对全部文件摘要。

本机示例，数据库与目录按自己的部署调整：

```bash
# 先停止中心和 Worker，并确认没有正在执行的模型任务。
mkdir -m 700 -p backups/snapshot-001
pg_dump --format custom --file backups/snapshot-001/database.dump skill_eval
python3 deploy/volume_backup.py pack --archive backups/snapshot-001/files.zip \
  --root center=data --root worker="$HOME/.local/share/open-skill-eval-worker" \
  --root model=/path/to/selected-codex-profile --exclude model/tmp
```

使用 PGHOST、PGPORT、PGUSER、PGPASSWORD 或服务配置指定数据库；不要把密码写进命令历史。备份 center 目录会同时包含 blobs 与 instance-key；缺少任一项都不是完整恢复。内置 Worker 还需保存 builtin-secret 和 database-secret；下方 Compose 维护服务已配套挂载。

Compose 命令（Podman arm64 与 2026-10-25 本地 Docker Desktop 原生 arm64 已实测配套备份与恢复，平台证据分别记录）：

```bash
mkdir -m 700 -p backups
docker compose stop worker api
docker compose exec -T db pg_dump -U skill_eval -d skill_eval --format custom > backups/database.dump
docker compose --profile maintenance run --rm backup pack --archive /backup/files.zip \
  --root center=/volumes/center --root worker=/volumes/worker --root model=/volumes/model \
  --root database=/volumes/database --root builtin=/volumes/builtin --exclude model/tmp
docker compose up -d api worker
```

`--exclude root/relative/path` 仅用于备份，逐项记录到 manifest；不能排除整个 root。上述命令只略过可重建的 Codex `model/tmp`，保留 config.toml、auth.json 和其他持久文件；其他位置的符号链接仍会拒绝备份。恢复不接受排除参数。每次备份使用新目录，避免把不同备份点混在一起。维护服务只有显式选择 maintenance profile 才启用，平时不运行。

## 恢复到新环境

本机先建立**新的空数据库和空目录**：

```bash
createdb skill_eval_restored
pg_restore --dbname skill_eval_restored --no-owner --exit-on-error backups/snapshot-001/database.dump
python3 deploy/volume_backup.py unpack --archive backups/snapshot-001/files.zip \
  --root center=/new/location/data --root worker=/new/location/worker --root model=/new/location/model
```

随后以新的 OSE_DATABASE_URL、OSE_DATA_DIR 启动中心。使用恢复的实例密钥，原会话和版本引用才能保持；更换中心地址时，PUBLIC_URL 和 Worker 本机 connection.json 中的 url 要一起调整，凭据不需要重发。确认恢复环境后再恢复 Worker 执行，避免新旧中心同时使用同一连接目录。

Compose 恢复在新项目和全新卷执行；恢复前不要启动 init、api、worker。先将备份放进新的 OSE_BACKUP_DIR，用维护服务 `unpack` 恢复上述五个 root，并增加 `--owner 10001:10001`。然后启动 init 和 db，以 `pg_restore -U skill_eval -d skill_eval --no-owner --exit-on-error` 从标准输入恢复 database.dump，最后启动 api、worker。该步骤分别在 Podman Linux arm64 与本地 Docker Desktop 原生 arm64 的全新项目和卷中走通；Docker 最新收据见 [Pro / Docker 验收](verification/local/pro-docker-e2e-2026-10-25.md)。其他宿主和原生 x86_64 仍需单独验证。

恢复后核对资源数量、启用版本、任务历史、文件摘要和至少一个报告下载。已有运行任务在租约过期后会标记中断；系统不会自动重复模型调用。本机验证记录见 [restore.json](verification/local/restore.json)。

## 排障

| 现象 | 下一步 |
| --- | --- |
| 端口被占用 | 换 OSE_PORT 和 PUBLIC_URL；不结束其他应用的进程 |
| 页面请求来源不受信任 | 使用 PUBLIC_URL 对应地址访问，注意 localhost 与 127.0.0.1 不等价 |
| Worker 离线 / 无法连接 | 核对中心 URL、HTTPS、网络和 Worker 进程；已接入的 Worker 启动会自动重连 |
| 接入码无效 | 10 分钟内只可兑换一次；在系统配置生成新码 |
| 已撤销的内置 Worker | 保留旧 state-dir 备份，使用新 state-dir 和网页单次码接入；不要删库恢复旧权限 |
| 需要 Codex 0.162.1 | 使用 Worker 安装器的 --install-codex 安装私有版本；不修改系统版本 |
| 显示已登录但模型请求失败 | “已配置”只表示本机有登录资料；核对模型名称、登录有效期和服务连接，再点击真实检查 |
| 模型调用卡住 / 超时 | 查看失败原因和原始产物；检查网络；手动重试会创建新 attempt，可能产生额外模型调用 |
| 修改草稿提示冲突 | 另一个页面已保存；刷新后对照内容，避免覆盖他人的修改 |
| 没有可启用案例 | 先修复全量校验问题；空集、缺附件和未引用案例不能启用 |
| HTML 报告内反馈按钮无效 | 原始报告在沙箱中展示，网络和提交被限制；案例结果与原始 ZIP 仍可查看 |
| 容器 Codex 沙箱失败 | 保留失败信息；不加 privileged、不挂 Docker socket、不静默绕过沙箱；可先用已验证的本机 Worker |

## 部署检查

CI 使用 `python3 deploy/compose_smoke.py --state .local/compose-smoke.json` 验证全新空库引导与唯一内置 Worker；重建容器并保留卷后加 `--verify` 检查原会话与 Worker 身份。脚本不调用模型，状态文件含会话凭据，不得上传。`--url` 默认为本机 8765，验证时必须与原地址一致；`--timeout` 为 10–1800 秒，默认 180。真实模型和目标平台验收另行记录。

Linux Worker 在生成和评测前显式使用 `codex sandbox -c 'sandbox_mode="workspace-write"' -- ...` 执行本地读写自检；失败时保存 sandbox.log，任务记为不完整，不调用模型、不放宽权限。固定 CLI 的独立 sandbox 命令需要该显式模式，不能把只读探针的失败当成工作区写沙箱不可用。当前 Docker Desktop arm64 的正反检查通过；amd64 模拟路径在 Codex 自身 seccomp 安装阶段返回 EINVAL，仍不能执行真实模型验收。Podman 的历史 devpts 失败也保留原边界。
