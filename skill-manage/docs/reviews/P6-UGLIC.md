## UGLIC 检查 — 0.3.1 P6 模型超时与验收

日期：2026-10-24。范围：4d1ccd9 后的模型调用、失败诊断、安装包与验收文档。内置 Skill 内容和规则未改，沿用 P4 的独立 Skill 审查记录；没有公开发布。

### U — Usability & User Experience

已修 U1（WARN）：原界面只有 model_unavailable，不能区分请求超时或服务状态。execution_api.py 的 model.failed 事件只保存 code/retryable；static/app.js taskFailure 按最新事件显示中文原因和下一步，HTML 始终转义。未知或损坏事件安全回退通用提示。

### G — Grammar

✅ ruff format/check、node --check 与 git diff --check 通过。版本、README 安装路径、Compose 镜像与 wheel 均为 0.3.1；数据库版本保持 4，不为超时补丁新增无关迁移。

### L — Logic

已修 L1（ERR）：models.py completion 固定 40 秒，真实完整审计耗时约 85 秒时被提前终止；此前能力探测成功也无法完成主链路。实际执行调用传 timeout=90，worker_client.py 对模型代理等待 100 秒，避免外层先超时；探测仍 40 秒。父进程任务总时限、租约/心跳、取消、调用预算和完整复审 Gate 保持原契约。Linux 全新非 editable wheel 真实闭环通过。

✅ 超时只作为稳定 model_timeout，可有限重试；HTTP 与其他网络错误分别保留，不打印异常原文。tests/test_models_runner.py 覆盖直接 TimeoutError、URLError 包装超时、代理超时设置与无敏感值失败事件。

### I — Integrity

✅ VALIDATION.md 保留 0.3.0 的失败证据，追加 0.3.1 原因与成功记录；不把能力探测、协议 fixture 或 macOS 成功替代 Linux 原生完整验收。smoke_native_live.py 在临时数据删除前收集稳定模型错误码，保留备份/恢复与密钥不入备份检查。

### C — Containment

✅ 没有改动模型服务地址/账号/Key，没有添加供应商专用参数，也没有降低规则或分数要求。模型 Key 只从用户本地 600 配置读取，测试只读挂载；不发 worker、不写报告或 Git。临时环境按初始状态清理，演示实例保留。

## 汇总

| 项目 | 初检级别 | 处理与复核 |
| --- | --- | --- |
| U1 | WARN | 已修；API 事件与 Node 文案检查，安全回退与 HTML 转义复核 |
| L1 | ERR | 已修；40 秒实际复现、85.46 秒对照、90 秒设置 Linux 原生真实闭环 |
| 不同模型的耗时与收敛差异 | 外部限制 | 仍受总时限与完整复审 Gate 约束，不保证任意模型/业务输入必定成功 |

本次修改无未解决代码 ERR/WARN；最终安装模式与发行物结果详见 VALIDATION.md。
