# 运行与恢复

## 数据路径

使用 `SKILL_MNG_DATA` 为所有命令设置同一绝对目录，避免对不同安装执行启停。默认 `~/.local/share/skill-mng`，Compose 为 `/data`。目录含数据库、原包和运行状态，不加入 Git。`config` 输出 host/port、路径和脱敏模型状态。

原生后台进程由 start/stop 管理，前台 `server run` 由容器或系统服务管理。仅允许一个服务打开同一数据目录；server.lock 在进程退出后由内核释放。PID 记录含随机实例标记，发现 PID 复用会拒绝 kill；不要靠猜 PID 修复。

端口冲突时，停止本实例或在 config.json 改 port，然后 start。目录不可写时，检查当前用户与目录权限。迁移异常应停止升级并保留数据库，从备份恢复到空目录；禁止改 user_version 强行跳过。

## HTTPS 共享访问

默认只供本机使用。对外提供服务时：Web 在受信任反向代理之后运行，阻止用户绕过入口访问后端，并将 `SKILL_MNG_PUBLIC_URL` 设为实际 HTTPS 站点，例如 `https://skills.example.com`。这样服务端用该地址校验 Origin，并为登录 cookie 设置 Secure；不依赖来路不明的 X-Forwarded-*。代理须保留原始 Host。

Compose 如需代理接入，优先连接相同容器网络，不把后端端口暴露到公网。更改 `SKILL_MNG_HOST` 可配置容器监听地址；它不会改写持久 config.json。

## 备份与升级

CLI `backup` 将 SQLite 一致性快照、对应原包及逐文件 SHA-256 写成 ZIP；备份文件权限 600，拒绝覆盖已有文件，目标必须位于 data 之外。备份期间包登记短暂等待存储锁，账号写入仍可正常完成，数据库备份使用 SQLite snapshot 语义。

CLI `restore` 校验格式、路径、摘要、数据库 quick_check、外键与包引用，先写临时目录，全部成功后移动到空目标；不覆盖运行实例。恢复后清除旧会话和未完成的临时导入，账号密码保持不变。备份中的程序配置只恢复 host/port；HTTPS public URL 由部署环境重新指定。

升级：备份 → 停止旧程序 → 安装固定版本 wheel/镜像 → `db migrate` → `start` / Compose up → `doctor` 与 health。回退：使用旧程序和升级前备份恢复到新空目录。不支持数据库自动降级。

## Worker 与模型

原生 `start` 自动启动 Web 与内置 worker，`server start` 仅启动 Web。Compose worker 使用独立数据卷，机器凭据从只读 link 卷获得，不挂载数据库。`worker run` 是前台托管入口；`worker start/stop/status/logs` 管理后台进程。外接 worker 仅需站点地址和一次码，模型由平台统一代理，不接收来自 worker 的 URL/Key/tool 定义。

凭据文件为 `worker/credentials.json`（600）；Compose 用 `SKILL_MNG_WORKER_CREDENTIALS=/link/credentials.json`。`SKILL_MNG_BUILTIN_CREDENTIALS` 仅用于服务端首次自动配对，`SKILL_MNG_WORKER_SERVER` 为自动配对的站点地址。不要手工将 builtin=true 用于不可信 HTTP 网络。

模型配置 `model-config.json`（600）不入备份；Key 不回显。API Base URL 必须指向管理员信任的服务；模型请求禁用重定向和环境代理。能力检测两次实际调用；保存新配置后必须重检。配置变化会终止使用旧 revision 的执行，创建新任务即可。

恢复会撤销所有旧机器及一次码，取消未完成任务、作废租约；已保存报告保持字节/摘要。启动后生成新的内置机器，外接机器重新 join。需要重新配置模型。旧 worker 本地未交付结果不自动导入恢复实例。

worker 结果保存在自己的 worker/attempts 与 worker/frozen；网络临时故障有限重传，无法交付时保留冻结文件。按保留周期停止 worker 后清理已结束任务的缓存，不删除运行中的 current.json。故障分类只显示稳定 code，不回显远端响应或密钥。模型调用失败会在任务事件中记录 model.failed，细节只有 code/retryable；model_timeout 表示请求等待超时，model_http_NNN 表示模型服务 HTTP 状态，model_network_error 表示其他连接异常。

## 版本边界

0.3.1 开放审计、授权修复、候选和新版本门禁。完整审计需要支持工具调用与严格 JSON schema 的兼容模型服务。超大文本、无法解析证据或覆盖未完成会显示待复核，不能手工将结果改成 PASS。源码按用户授权同步至 `Songhonglei/lume-skill` 的 `skill-manage/`；公共包源与镜像尚未发布，发行物仍仅在原机器本地。

## 修复任务恢复与排障

原包仅下载和读取，worker 的候选与日志保存在 worker/attempts/<attempt>/round-N/。
候选 ZIP 与复审结果一经平台接收即冻结；重启先查询平台收据，复用已有报告，不重新评分。
每轮编辑仅允许授权 editPaths；SKILL.md 若不在编辑范围，只能由固定函数调整版本。
小文件证据在 60 KB 上限内一次提供，减少重复读取；大文件仍通过受限分块读取。编辑工具使用 auto 选择，审计缺失证据时强制只读工具；始终关闭并行工具调用。
文件工具使用当前内容 SHA-256 校验；写入失败会返回当前摘要或预期名称/版本供模型纠正。
edit-trace.json 只记录工具名、路径、错误码和是否保存，不记录文件正文、模型 Key 或完整请求。

edit_budget_exhausted / repair_round_budget_exhausted 表示调用/轮数预算耗尽；independent_review_requires_attention 表示复审结论或范围未决；unselected_issue_blocks_review 表示另有未授权阻断问题。此时原版本未变，重新审查范围并创建新任务，不改写旧报告冒充通过。

修复期间如有新版本登记、当前指针变化，或原授权者被停用/失去权限，登记门禁会拒绝自动发布并保留已保存候选。手动登记同样检查。恢复备份会取消未完成任务并撤销旧机器/码；已完成的冻结报告与已登记版本保持摘要。

模型能力检测单次等待 40 秒，实际审计/修复调用等待 90 秒，worker 等待平台 100 秒；不改变任务总时限。
审计默认 300 秒/16 次模型调用；修复为 900 秒/96 次，父进程硬上限 1200 秒。退出信号先停止子进程，租约失效或机器撤销后不得继续提交或调用模型。不同版本的 Web/worker 应一起升级，避免旧 worker 不支持修复协议。
