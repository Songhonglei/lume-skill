# 开发接续与历史验收记录

## 2026-10-25 / 0.3.2.dev0 / T01 本地接续

在新的本地空目录拉取合集仓库 `eca5e69`；Python 3.12.13，使用现有固定依赖和 uv.lock，schema 4 不变。先复现原基线 80 项通过，再添加 51 项合成隐私用例，全套 131 项通过；ruff check/format、node --check、git diff --check 通过。保留原有一条 TestClient/httpx 弃用提示，没有调整运行依赖。

验证包含：短口令、无引号环境配置、JSON/YAML/多行私钥、分块与大文本、示例值复核、跨文件重复值遮蔽、原包/文件摘要保持、报告 ID/摘要重建、冻结结果重传、服务端独立阻断与零模型调用预算、拒收伪造 PASS/原值回显/未声明附加字段、候选写入及接收门禁。所有目标均为合成文本，未执行目标代码，未使用真实服务或收费模型。本轮不能复述为新的真实语义闭环或跨机器验收。

策略和复查入口见 [TARGET-PRIVACY.md](TARGET-PRIVACY.md)。内置独立 Skill 无改动，原规则版本和历史报告保持。当前为开发版本，不替换 0.3.1 历史发行物，不发布公共包或镜像。T02–T04 及 T05–T08 仍待后续安排。

本地 wheel/sdist 构建成功；独立 venv 非 editable 安装后，`tests/smoke_wheel.py` 的 7 组实际进程检查通过（初始化、启停幂等、上传/下载、内置/外接 worker 静态审计、备份恢复、同端口重启）。45 个应用文件与 wheel 逐字节一致；sdist 不含 `.local/`、venv、数据库或日志。合成隐私 runner 在安装环境中另验无模型调用与原包摘要保持。临时服务及数据自动清理；本地回执为 `.local/t01-wheel-smoke.json`、产物及摘要清单为 `.local/t01-artifacts/`，均不进入 Git。

# 0.3.1 / P1–P6 历史验收记录

日期：2026-10-24。P0–P6 首期范围完成。macOS 26.5.1 / arm64 / Python 3.12.12；Linux arm64 / Podman 6.0.2 / Compose 5.3.1。验收当时只有本地仓库、wheel/源码包与镜像。2026-10-25 干净源码与文档同步至 `Songhonglei/lume-skill/skill-manage`；包和镜像未公开发布，本文件的真实模型与平台证据仍属于原验收轮。

## 本轮结果

| 检查 | 结果与证据 |
| --- | --- |
| 自动回归 | 80 项全套通过。原 42 项注册、安全、存储和生命周期反例保留，新增任务、租约、模型、独立 Skill、真实进程恢复/取消、修复与发布 Gate |
| 静态 | ruff format/check、node --check、git diff --check 通过；1 条开发 TestClient/httpx 弃用提示 |
| P4 真实语义正反例 | 使用用户本地配置的兼容服务，实际工具/schema 检测；合成 good 完整 PASS 117/117、零 ERR/WARN，bad FAIL 111/117、4 条 ERR。全程未执行目标代码 |
| P5 真实修复 | 合成 bad 的所选文档/脚本缺陷，9 次模型调用、1 轮后完整复审 117/117、零 ERR、scopeSatisfied=true、reviewRequired=false，登记 1.0.1。原包、原报告和 current 指针保留 |
| Compose 真实闭环 | 0.3.1 Linux Web + 独立 worker：注册→完整 FAIL 审计→授权修复→新会话完整 PASS 117/117→登记/下载；审计 2 次、修复含复审 6 次调用、1 轮。双摘要、报告摘要及重复发布幂等通过；此前 0.3.0 的成功与失败证据仍保留 |
| macOS wheel 真实闭环 | 非 editable 安装、源码目录外独立数据：同一真实模型闭环、7 次审计及 12 次修复含复审调用；备份恢复报告摘要一致、无模型 Key、旧机器已撤销 |
| 现有数据升级 | 0.3.0 数据先备份后重启至 0.3.1，users/skills/versions/audit_runs/repair_runs 数量、历史报告摘要和本地模型配置均保持不变 |
| 最终 wheel 基础烟测 | setup/start 幂等、真实静态审计、外接 worker 独立目录/重启、下载摘要、备份恢复、停止后同端口立即启动，7 组通过 |
| Linux 原生真实闭环 | 0.3.1 全新 venv / 完整依赖 / 非 editable wheel；3 次审计与 6 次修复含复审调用，1 轮 PASS 117/117、新版本及备份恢复通过，详见下文 |
| Linux wheel 与干净安装 | 公共 Python 基础镜像内全新 venv 从公共 PyPI 安装全部固定依赖及 wheel 成功；另从公共轮子离线全新安装、禁网执行 7 组 CLI/外接 worker/静态审计/恢复烟测通过 |
| 任务与凭据 | 并发一次码仅一次兑换、过期/消费/撤销/丢回执登记；并发领取、leaseGeneration、迟到拒收、取消、有限重试与结果重传 |
| 独立 Skill | stdlib 静态预检、manifest/原 ZIP/目录双校验、拒绝摘要变化与覆盖输出；规则 52 条，L1 117/L2 120，零分 ERR 阻断 PASS |
| 修复 Gate 反例 | 越权和未知问题、授权外文件、仅改版本约束、未完整复审、范围不符、所选问题未清、新版本冲突、取消、复审后篡改、3 轮上限、重复发布、SQL trigger 保存异常事务回滚 |
| 模型异常 | satisfied 误入 findings、逐规则状态漏项/冲突、无效 JSON/null/status 类型、过多工具调用与上下文上限；不完整证据不能 PASS。小文件在 60 KB 上限内一次提供，剩余范围由只读工具补齐 |
| 恢复 | 冻结候选及报告重用，不因交付重试重新评分；Web/worker/runner 实进程同租约恢复与取消另有协议 fixture |
| 隔离与隐私 | Compose 应用 UID 10001、worker 不挂载 SQLite；模型配置仅 Web 保存，Key 不发 worker、不入备份、源码或镜像；测试临时配置随测试卷清除 |
| 发行物 | 最终 wheel 与镜像内 44 个应用文件逐字节/摘要对齐；sdist 排除 .local、数据库、日志、venv 与凭据。摘要在 dist/SHA256SUMS |
| 质量与依赖 | 平台 P5 UGLIC；内置 Skill 资源本轮无改动，沿用 P4 UGLIC→skill-release-audit（6 模块通过、0 ERR/WARN）；完整固定运行依赖审计 0 条已知漏洞 |

## Linux 原生追加验收

全新 Linux venv 从公共 PyPI 安装 16 个固定依赖与本地 wheel 成功；另一次使用公共 PyPI 下载的轮子离线安装，禁网运行 7 组 CLI/静态审计/外接 worker/恢复烟测通过，未复用系统 site-packages。

此前 0.3.0 两次 Linux 原生真实模型闭环失败，源包审计连续返回 model_unavailable。本轮增加 model.failed 脱敏事件后，用原 40 秒上限复现为连续三次 model_timeout。实际同一合成审计请求直接调用耗时 85.46 秒返回，确认能力探测成功不代表完整审计能在 40 秒内完成。对照返回的逐规则状态不足 50 项，仅作为传输耗时证据；完整通过依据是后续平台完整性校验与独立复审。

0.3.1 将实际审计/修复模型请求等待设为 90 秒，worker 等待平台设为 100 秒；能力探测仍为单次 40 秒，审计/修复的总时限、调用次数和发布 Gate 保持不变。没有降低分数、移除规则或跳过未决项。超时、HTTP 状态与网络异常均只记录稳定 code，页面给出可操作提示。

最终 Linux 原生验收通过：从公开 Python 基础镜像创建不继承系统 site-packages 的全新 venv，使用公共 PyPI 轮子安装完整固定依赖与 0.3.1 wheel。实际注册→完整 FAIL 审计→所选问题授权修复→新会话全量 PASS 117/117、零 ERR→原子登记/下载新版本，1 轮、审计累计 3 次模型调用、修复含复审 6 次调用。报告/原包/新包摘要、current 指针保留、重复发布幂等、备份恢复报告摘要、恢复无模型 Key、旧机器撤销均通过。Linux Compose 0.3.1 另以相同真实模型独立执行完整链路，2 次审计、6 次修复含复审调用、1 轮通过；随后实际重启 Web/worker，账号、报告和下载摘要保持，worker 自动重新上线。

原失败证据仍保留：.local/linux-wheel-live-p5.log、linux-wheel-live-p5-retry.log。新诊断为 .local/p6-linux-native-live.log，90 秒设置与最终成功在 .local/p6-linux-native-live-90s.log / linux-native-output/p6-linux-native-live.json；对照请求统计为 .local/p6-direct-structured-result.json，不含完整模型正文或密钥。可用 tests/smoke_native_live.py 重复验证。

## 真实模型失败记录

成功记录不能代表每次调用稳定。实际追加验收曾发生模型把已满足规则列为问题、遗漏规则状态、重复读取工具直至预算耗尽，以及服务暂时不可用。首轮审计/复审因此待复核或任务失败，候选没有发布；另有仅候选 UI 任务因 edit_budget_exhausted 进入待处理。保留失败任务和证据，没有覆盖旧报告或改分数制造成功。

已修复确定的实现问题：读证据与严格 JSON 分阶段；逐规则状态一致性；工具顺序调用；小包一次提供完整证据；无效输出明确待复核/待处理；摘要冲突返回最新摘要供模型纠正。模型仍不遵守协议、超时或预算耗尽时需管理员核对模型服务或缩小授权范围后新建任务，平台不保证任意模型都能自动收敛。

真实模型配置由用户在本机设置。没有新建账号或 Key；本报告不记录服务 URL、账号和密钥。协议 fixture 明确标注为协议测试，不代替上述真实调用。

## 本轮浏览器

通过 ego-browser 使用实际工作台：从失败报告选中 ERR、填写授权并创建仅候选任务，真实失败时显示待处理；打开成功任务查看独立复审、授权与逐文件差异。下载新 ZIP 与 Markdown 分别核对 artifactDigest / reportDigest。1440px 桌面、390px 手机页面无横向溢出，截图已查看。成功任务保留供用户浏览。

P2 真实浏览器证据保留：

## 真实浏览器

通过 ego-browser 操作本机实际服务，未用预置页面或预置 API 成功结果：

1. 读取本地一次性初始化凭据，创建管理员并登录，进入真实空库。
2. 导入合成 hello-skill ZIP，查看 SKILL.md，下载后 SHA-256 与上传包完全一致。
3. 通过公开 GitHub archive URL 导入 Humanizer；上游没有版本号时补填 `url-smoke-20261023`，用冻结原包完成登记。原包 SHA-256：`b1210453bc037f534d4d92cfb9b6dce194ac1428a9b11a79392009488b4d6da1`。来源为 [blader/humanizer](https://github.com/blader/humanizer)，仅作为运行数据验证，没有复制进源码或发行物，也没有执行其内容。
4. 选择实际目录，保留 `references/message.txt` 子路径并读回文本；重复导入复用原版本。
5. 复核“缺元数据 → 关闭 → 重新选择目录”回归；已修复隐藏字段残留 required 和浏览器默认提交丢失相对路径的问题。
6. 管理员通过设置页面创建维护者，列表实时显示；权限隔离与会话停用另有 API 自动反例。
7. 1440px 桌面、390px 手机实测无页面横向溢出。企业工作台风格采用灰白背景、蓝色操作、紧凑顶栏/表格和文件预览；没有纸张/橙色方案。


## 可重复证据

- `uv run pytest -q`；`uv run ruff check src tests`；`node --check src/skill_mng/static/app.js`。
- `python3 tests/smoke_wheel.py /absolute/env/bin/skill-mng`：不导入项目源码，随机密码不打印。
- `python3 tests/smoke_live.py --help`：对指定实际平台执行真实兼容模型闭环，凭据仅从 600 文件读取；不会执行目标包。
- `python3 tests/smoke_native_live.py --help`：非 editable 安装入口、独立数据、真实闭环及备份恢复。
- [P6 补丁 UGLIC](reviews/P6-UGLIC.md)、[P5 平台 UGLIC](reviews/P5-UGLIC.md)、[P4 内置 Skill UGLIC](reviews/P4-UGLIC.md)、[Skill 发布审计完整 JSON](reviews/P4-skill-release-audit.json)。
- 本机 ignored 证据：compose-live-p6.json、linux-native-output/p6-linux-native-live.json、demo-upgrade-p6.json、wheel-smoke-p6.json、container-image-manifest-p6.json、compose-restart-p6.json、original-0.3.0-artifacts-p6.json、live-p4-results.json、live-p5-results.json（含此前 v1/v2 失败记录）、compose-live-p5.json、native-wheel-live-p5.json、container-image-manifest-p5.json、linux-compose-static-p5.json、linux-native-output/fresh-linux-wheel-smoke-p5.json、linux-clean-install-p5-retry.log、dependency-audit-p4.json。
- 浏览器截图 repair-desktop.png / repair-mobile.png，下载 browser-p5-report.md / browser-p5-package.zip。旧 P2/P4 证据继续保留在 .local。

## 发行物与环境边界

wheel/sdist 的最终 SHA-256 写入发行目录 `dist/SHA256SUMS`，避免把产物自己的摘要嵌入源内容。0.3.0 历史发行物已从固定提交 4d1ccd9 重建并核对原始 SHA-256 完全相同，诊断过程的临时构建没有替换最终历史包。镜像只在本地构建，无公开推送。Docker Hub 本机拒绝连接，构建采用公开 ECR 的 docker/library/python:3.12-slim；Python 依赖来自公共 PyPI，未引入内部镜像或包源。Linux 首次直接下载因网络抖动返回无候选版本，重试完整安装成功；公共 PyPI 对应版本元数据也已核对存在。

Windows、x86_64 Linux、ARM 以外原生 CPU 和真实跨机器网络未覆盖；外接 worker 在同机独立目录通过 HTTP 验证。没有调用目标 Skill 的业务脚本或任意代码执行；修复正确性由固定静态规则、模型独立复审和发布 Gate 共同检查，不承诺证明任意业务语义。

内部依赖扫描中的 is_multicast 是 IP 安全检查，redoc_url=None 是关闭 FastAPI 文档，许可证 associated 是普通英文，不是业务依赖。保留来源与许可，不为消除误报删除有效实现。
