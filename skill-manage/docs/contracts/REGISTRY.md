# P0 领域、状态和接口契约

契约版本 1。平台版本 0.3.1。注册、任务、审计与授权修复已实现。

## 存储与身份

- `users`：本地账号，用户名大小写不敏感唯一，角色 admin / maintainer；停用后会话失效。无公共注册。
- `skills`：`id` 不变、`slug` 全局唯一，单 owner_id；current_version_id 由 API 限定在同 Skill 内。所有已登录成员可读，owner 与管理员可写；只有管理员能改归属。
- `versions`：`(skill_id, version)` 唯一且不可变；固定 content_digest、artifact_id、上传者、包清单。相同版本相同内容幂等，异内容返回 409，不覆盖原包。
- `artifacts`：原包 SHA-256 唯一，字节大小、媒体类型；文件名为摘要。目录导入先生成 ZIP，ZIP 导入保留原始字节。相同内容但不同封装复用既有版本，保留第一次登记的原包。
- `sessions`：随机 256bit cookie，只存 token 摘要，24 小时有效；独立随机 CSRF、HttpOnly、SameSite=Strict。HTTPS 入口设 Secure。
- `import_drafts`：待补元数据的冻结原包；随机令牌仅存 hash、绑定上传者，10 分钟过期，成功结果可幂等重取。每人最多 5 个、全站最多 64 个待补填包；临时文件不进入备份，恢复后丢弃未完成导入。
- `audit_runs`：固定 version_id、审计深度、rule_version；verdict 与 delivery_status 独立。报告内容在 P4 与结果一起入库。
- `findings`：归属 audit_run，携带稳定 rule_id、severity、review_required 和结构化定位。
- `repair_runs`：固定源 audit_run、授权者和不可变授权快照，最多 3 轮，候选摘要与复审绑定。
- `tasks`：固定 version_id、kind、输入 manifest、创建者，全局 idempotency_key 唯一；lease_generation 单调递增。
- `task_attempts`：`(task_id,generation)` 唯一，worker、租约截止、结果摘要；迟到结果不能覆盖新代次。
- `worker_enrollments`：一次码仅存 hash、10 分钟到期、消费/撤销记录；事务消费。`workers` 独立机器凭据 hash，不是用户 session。
- `events`：追加式操作记录，主体 ID、操作者、事件类型、细节、UTC 时间；不存密码与令牌。

SQLite user_version 编号迁移；WAL、foreign_keys=ON、busy_timeout=10000。写事务显式 BEGIN IMMEDIATE。包登记持有 storage.lock 后原子写原包，再提交数据库；崩溃可能留下未引用完整 blob，不会形成指向半包的有效记录。备份同锁协调 SQLite backup API，不复制运行中的 WAL 单文件。

内容身份算法：移除唯一顶层包目录，按规范化路径排序，对每个文件计算 SHA-256；累积 UTF-8 `path + NUL + lowercase_file_sha256 + LF`，最后计算 SHA-256。空目录不参与，文件名大小写冲突拒绝。算法版本为 1，存入版本 manifest schema_version。

## 四组独立状态（审计与修复均已实现）

| 对象 | 状态与约束 |
| --- | --- |
| Task.state | waiting_configuration → queued → running → succeeded / failed / cancelled；租约过期转 queued 并增加下一次 generation；停止进入 cancelling → cancelled，取消后的提交拒绝 |
| Audit.verdict | pending → pass / fail / review_required / error；pass 必须分数 ≥90、零 ERR、必要结论全部完成；0 分 ERR 仍阻断 |
| Audit.delivery_status | pending → saved / failed；传输重试保持 run ID 与报告字节，保存失败不能放行 |
| Repair.state | pending → editing → reauditing → ready → published；异常进入 needs_attention / cancelled；所选规则仍失败且轮数不足时返回 editing |

终态不可被旧 attempt 改写。重试必须有界，网络/429/5xx 才重试；鉴权、摘要或契约不匹配直接拒绝。只有对应执行器实现后才开放任务 API。

## 注册 API（已实现）

统一 `/api` 前缀，错误形如 `{"detail":"可操作提示"}`。公开 health / onboard 状态；其他读接口需 session。写请求需 `X-CSRF-Token`，浏览器 Origin 必须匹配本站或显式配置的 PUBLIC_URL。

| 方法与路径 | 输入 / 行为 |
| --- | --- |
| GET health / onboard | 版本、schema、能力；是否完成初始化，不暴露初始化凭据 |
| POST onboard | token、username、password；共用 CLI 初始化服务，仅能创建一次 |
| POST login / logout；GET me | 本地账号；10 次/分钟/IP（单服务内存限速）；logout 删除服务端 session |
| GET / POST users；PATCH users/{id} | 管理员列出/创建/启停成员；禁止停用当前管理员和最后一个管理员 |
| GET skills；GET skills/{id} | 库、归属、版本；详情返回 can_write |
| POST import/upload | multipart file + 可选 name/version；ZIP ≤16 MiB |
| POST import/directory | multipart files（filename 为相对路径）+ 可选 name/version |
| POST import/url | JSON url + 可选 name/version；每跳校验公网并固定实际连接 IP；不保存 URL 查询凭据 |
| POST import/complete | import_token + name/version；用已冻结的原包完成登记，不重新下载链接；令牌绑定上传者 |
| GET versions/{id}/files；GET versions/{id}/file?path= | 清单、UTF-8 文本 ≤256 KiB；不把包文件作为 HTML 执行 |
| GET versions/{id}/download | 原始 ZIP + X-Artifact-SHA256 |
| PUT skills/{id}/current | version_id 必须属于同 Skill，owner/admin 权限 |
| PUT skills/{id}/owner | owner_id 必须为可用账号，仅管理员 |
| GET system | 当前阶段与能力，不把未实现执行器表示为在线 |

注册返回 `skill_id/version_id/reused`；缺元数据返回 `needs_metadata:[name/version]`、已解析 metadata 和 import_token，客户端补填后提交 complete。YAML 不规范的 Skill 允许手填登记信息，原文件不变，留待后续审计。无效 ZIP 返回 400，越权 403，版本冲突 409，请求过大 413。

## 任务 manifest 与结果（P3/P4 已实现）

输入：schemaVersion=1、taskId、attemptId、leaseGeneration、auditRunId、skillId、versionId、registeredVersion、contentDigest、artifactDigest、depth=L1/L2、ruleVersion、mode=static/full、modelRevision、limits。审计没有写授权；修复任务加入绑定问题 ID、路径与轮数/预算的 authorization。语义审计不得执行上传包。

结果：schemaVersion=1、与输入相同的 task/attempt/generation/run/version/digest/depth/ruleVersion，verdict、score、maxScore、errorCount、warningCount、reviewRequired、findings、reportDigest、reportMarkdown、repairPrompt。每个 finding 包含 id/ruleId/severity/points/file/line/message/suggestion/verification/reviewRequired。报告摘要对 UTF-8 原始字节计算，报告不可因重试重写。

P4 服务端重新校验 ruleVersion、满分、扣分、ERR 数、报告摘要以及包身份；deliveryStatus 由入库服务决定，不接受 worker 自报 saved。P5 发布门禁只接受独立复审通过、交付完成、授权范围和候选摘要一致、任务终态有效的结果。0 分 ERR 修复不增加分数。

## CLI / 配置

配置共用 `SKILL_MNG_DATA` 或 `--data-dir`，默认用户本地数据目录。其下 config.json、registry.db、objects/、run/、tmp/。首次管理员来自 CLI 隐藏输入或 Web 一次性码；二者共用 initialize，重复 setup 不重置密码。

已实现 setup/start/stop/status/logs/config/doctor/server start/server run/backup/restore/db migrate、worker join/start/stop/status/logs/run、model configure/status/check。setup 的可选模型参数与 model/Web 共用配置服务；能力检测两次实际调用。worker 通过 HTTP API 工作，机器数据目录不创建 registry.db。

模型工具只提供 read_file/write_candidate/delete_candidate/finish_edit 和固定语法解析，没有任意 shell、exec/eval、模块导入或安装钩子。模型 Key 不进入目标目录、manifest、模型上下文或诊断输出。

## 执行 API

管理员 session + CSRF：GET/PUT model、POST model/probe；POST/GET worker-enrollments、DELETE worker-enrollments/{id}；GET workers、DELETE workers/{id}。
owner/admin：POST audits（version_id、depth、mode、idempotency_key）、POST tasks/{id}/cancel。所有已登录成员可 GET tasks、tasks/{id}、audits/{id}、audits/{id}/report（Markdown）。

机器接口不使用浏览器 session：POST worker/enroll（code/name）消费一次码；以下均需 Bearer 专用凭据：POST worker/tasks/claim；POST worker/attempts/{id}/heartbeat/result/failure/model；GET worker/attempts/{id}/package?generation=N。除 claim 外均验证 attempt/代次/租约/撤销/取消。result 接受 generation + result；相同冻结结果重传幂等，冲突拒绝。

默认租约 30s、心跳 5s、全平台并发 1、最多 3 attempt、300s runner、16 次模型调用、模型上下文 220KB。模型代理固定 endpoint/model/system/rules/read_file/schema，worker 不能传 URL/Key/自定义工具。模型 Key 只留平台本地 model-config.json。旧配置 revision 的任务不继续调用。能力检测单次等待 40s，实际模型调用 90s，worker 对模型代理等待 100s；任务总时限保持不变。失败事件 model.failed 只存稳定 code 与 retryable，不存 URL/Key/响应正文。

恢复取消未完成任务、作废旧租约、撤销旧 worker/一次码，不恢复模型 Key；已保存报告和 findings 保留。修复 Gate 不把静态预检或未交付报告当作独立复审通过。

## 修复 API 与冻结边界

POST /api/repairs（owner/admin + session/CSRF）：audit_run_id、selected_ids（1–200 个明确 finding ID）、target_version、allowed_paths（可选额外相对文件）、max_rounds（1–3，默认3）、publish_after_review（默认true）、make_current（默认false）、idempotency_key。服务端从报告解析所选证据；冻结源报告/包摘要、editPaths、版本/指针基线和授权者，不采用模型自行扩大的范围。

GET /api/repairs/{id} 返回授权、状态、轮次、差异和复审；GET .../candidate 下载最新冻结候选；GET .../report 下载最新复审原文；POST .../publish 对 ready 候选进行相同 Gate 并幂等登记。共享库成员可读，创建/登记按当前权限检查，原授权者失权仍阻断发布。

机器接口（Bearer + 当前 attempt/代次/租约）：GET .../repair-state、POST/GET .../candidate?generation=N&round_number=N、POST .../review（generation/round_number/result）。候选 ZIP ≤16 MiB，内容与路径沿用包安全约束；差异最多 200 KB。每轮候选与复审只能冻结一次；同内容重传幂等，异内容覆盖拒绝。

模型请求除 generation/messages 外，支持 phase=audit/repair、round_number（修复必需）、require_tools（读取阶段）。修复模型不能跳过前轮复审；候选冻结后不能再编辑该轮。编辑工具仅内存中的授权文件，使用 expected_digest；没有 shell/exec/import/install。finish_edit 只结束编辑，不代表复审通过。

审计先强制读取文本证据，再输出结构化 ruleResults（每个活动规则恰一次 pass/fail/review）；状态与 findings 必须一致。覆盖和完成字段由本地控制代码归一化，不能以模型一句“通过”替代。复审使用全新模型消息，增加 scopeSatisfied/scopeReason；其身份、报告字节/摘要与候选绑定。

repair_rounds 保存 candidate artifact/content、diff、review JSON/digest 和 attempt 身份。最终 Gate 检查完整 PASS、必要项无待复核、所选规则已清、授权范围通过、候选未变、报告已接收、task 成功/未取消、权限与版本基线有效，再在一个 storage.lock + SQLite 写事务内登记 plannedVersionId、最终 audit_run/findings 和 published 状态。失败不产生半登记版本。
