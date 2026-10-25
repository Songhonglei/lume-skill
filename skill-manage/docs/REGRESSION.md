# T02：固定样例与批量回归

当前开发版本 0.3.2.dev6。执行入口 `python3 -m skill_mng.regression`，使用临时数据目录中的真实 CLI、Web/API、SQLite 和 worker；结束或中断时停止实例并清理临时数据，不连接现有共享库，不执行目标脚本。下文 dev4 运行是保留的历史回执；最新四项源码复核及真实重验见 [WEBAPP-TESTING-REVIEW.md](WEBAPP-TESTING-REVIEW.md)，累计预算保守 162/256、剩余 94。

## 输入、期望与证据

`regression/corpus.json` 固定 14 个用例的原始 ZIP/content SHA-256、注册版本、L1/L2、来源和期望理由。ZIP 使用固定成员时间和 ZIP_STORED，避免压缩库差异改变输入摘要。生成长文本仅展开清单中的固定文本，不能运行生成代码或安装钩子。输入或 vendor 字节变化而未明确更新清单时拒绝运行。

| 类别 | 用例 | 预期边界 |
| --- | --- | --- |
| 正例 | 多文件 L1/L2 | 静态仅待复核；真实完整审计才可 PASS。L2 的可选 Hub 警告保留 |
| 确定缺陷 | 语法、短 description、版本冲突、路径越界、错误 YAML | 指定规则必须报告；零分 ERR 仍阻断 |
| 覆盖与不确定性 | 动态路径、分块长文本、超过 256 KiB 文本 | 动态/超限证据不应消失；分块样例需完整读取 |
| 隐私 | 合成短口令 | 静态与完整模式都不应调用模型，D5-W3 待复核 |
| 语义专属 | 实现返回数字而声明问候语、必要引用缺失 | 静态未发现不等于正确；真实语义审计检查对应缺陷 |
| 真实公开样例 | Anthropic `webapp-testing` | 固定完整 6 文件快照，保留 Apache-2.0 许可和来源；完整语义结果必须人工裁定，不能自动计为准确率成功 |

公开样例来源为 [anthropics/skills 固定提交](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/webapp-testing)。`regression/vendor/WEBAPP-TESTING-SOURCE.json` 保留提交、逐文件 Git blob SHA-1 与 SHA-256；原始文件未经修复或格式化，也不会被导入或运行。Apache-2.0 是该样例的独立许可，不改写为项目 MIT。样例选择仅授权对公开文本做回归，不代表任何上游产品背书。

上游 SKILL.md 含原有尾随空格；`.gitattributes` 仅对该固定 vendor 子目录关闭 Git 空白检查，以保留可逐 blob 验证的原始字节。应用、测试和其他文档的空白与格式检查保持启用。

合成用例的期望来自明确构造的缺陷；一个问题可能合理对应多条规则时允许固定的规则组，不用改分数让样例通过。`strictConfirmed` 正例会统计额外已确认规则；其余用例仅对明确的正/反例规则计算差异，不能据此推算没有人工标注的全部漏报。所有新真实模型结果默认 `humanReview=pending`，程序断言不等于人工复核。

## 无模型回归

在项目目录：

```bash
uv sync --locked --extra dev
uv run python3 -m skill_mng.regression --mode static --output .local/static-run-01.json
# 选择用例或测重复稳定性，每次用一个新的输出路径
uv run python3 -m skill_mng.regression --mode static --case syntax-error --repeat 3 --output .local/static-run-02.json
```

输出路径必须是新文件，拒绝覆盖历史结果。每个重复轮次使用全新临时实例，避免前次登记的新版本干扰下一次修复。逐项保留原报告字节、报告摘要、输入双摘要、规则结论、耗时、调用数和预期差异。`evidenceKind=static_only` 的 passed 仅表示静态期望匹配，绝不表示完整语义 PASS。协议 fixture 仅用于 pytest 中的门禁/异常测试，不注入批量工具冒充真实模型。

可迁移的本轮静态回执在 `regression/baselines/static-2026-10-25.json`。该文件是一次实际运行的冻结记录，不要求后续随机 task/version ID 和时间戳逐字节相同；复查输入摘要、规则和判定口径。它不包含真实模型结论。

## 真实模型回归

需要管理员已有的兼容模型配置，JSON 字段为 `base_url`、`model`、`api_key`（无鉴权服务可为空）。文件必须是权限 600 的普通文件，不能是符号链接；不要把密钥放在命令行或 Git 中。工具只将配置写入临时实例，经正常模型设置与实际两次能力检测后运行；结果仅保留不含 Key 的 endpoint/model 指纹。

```bash
uv run python3 -m skill_mng.regression --mode full \
  --model-config /absolute/private/model.json --max-model-calls 256 \
  --with-repair --output .local/model-run-01.json
```

本轮用户已给出 **256 次**上限。2026-10-25 已只读提取 Kimi 本地文件中的相关密钥，模型列表查询返回 200；所选代际对应列表 ID `kimi-for-coding-highspeed`，实际能力请求返回 403，供应商明确说明该订阅无此模型权限。该 K2.7 探测未创建目标审计，保守累计 4 次。随后用户已明确授权切换到 `kimi-for-coding`（K2.8 Preview）；真实批次与协议兼容检查已完成，调用预算跨进程累计。无凭据证据见 `docs/evidence/KIMI-CAPABILITY-2026-10-25.json`。此前给出的 Harness 工具补丁不含连接字段，始终未修改 Harness 设置。

0.3.2.dev3 增加可选管理员设置 `reasoning_effort`（`low` / `medium` / `high` / `max`，省略为服务默认）；设置页和私有回归 JSON 均支持，worker 不能覆盖。仅在显式设置时发往供应商，不给其他服务增加默认参数。结果保存 `modelParameters.reasoningEffort`，连接指纹也绑定此参数。本轮 K2.8 后续批次选择 `low`，思考仍开启；不提高 6000 输出 token、单任务调用或总时限上限。

能力与证据工具请求使用 `tool_choice=auto`，仍严格要求能力检测返回指定工具及参数，且 runner 未读完证据不能完成语义审计。多轮仅回传响应中的 `content`、`tool_calls` 和字符串 `reasoning_content`，受原有消息/上下文限制；思考字段不写入审计报告。供应商 `finish_reason=length` 明确报 `model_output_truncated`，不把截断输出当完整结论。协议依据为 [Kimi 思考模型](https://platform.kimi.ai/docs/guide/use-thinking-models)与 [Kimi Code 模型设置](https://www.kimi.com/en/help/kimi-code/models)。

修复结果自 dev3 保留全部 `roundReceipts`（候选双摘要、脱敏 diff、冻结独立复审报告）；失败、未决和成功均适用。旧批次在未收敛复审期间由 Agent 中断，保留原始中断结果；其活动修复按完整 96 次上限计费，不把采样时已观察到的次数当最终费用。因此切换到 dev3 后跨进程保守累计 110/256 次，下一批次上限 146；最终余额以完整调用台账为准。

0.3.2.dev2 起，结果另存 `modelId` 与 `capabilityProbe.ready/failureCode`，避免只见 `model_probe_failed` 而无法区别鉴权、订阅权限或协议问题。只记录本地生成的稳定码，不保存上游原始响应或 Key；历史失败记录保持原样。

预算按保守上限预留：每轮能力检测最多 2 次、普通完整审计预留 16 次、修复任务预留平台 manifest 的 96 次；余额不足时记录 `skipped_budget` 并返回非零状态，不创建该任务。完成后按平台累计调用数扣账，再决定下一项。T01 阻断的包预留审计调用 0 次。平台原有总时限、重试、评分和发布门禁不变。无法取得终态时停止后续任务、保留 `modelSpendUncertain`，不把未知费用算作零；此处统计调用次数，不推测供应商费用或保证上游即时取消。

参数约束本次批量进程；跨进程重试必须扣除已有回执。例如首次 Kimi 探测已保守占用 4 次时，下一批次最多传 `--max-model-calls 252`；后续诊断或重试也须继续扣除，不能重新分配完整 256 次。

当前只有语法和 description 两例设有明确自动修复契约。只有指定规则出现可修复的已确认 finding 才授权；不能扩大到其他问题。成功必须经过平台独立完整复审与发布门禁，另外核对候选/报告双摘要、原包不变、current 不变和重复登记幂等。失败、未决、预算跳过和模型不收敛分别保留，不能删除失败后重跑到成功再只报告最后一次。

运行级 `evidenceKind` 区分真实任务模型调用、仅能力探测、未运行和中断后调用量未知；逐例也区分真实模型与零调用的静态阻断。真实样例 `manual_review` 不计自动通过；修复结果分别统计，不与审计匹配率混合。命令完成但有不匹配、执行失败、预算跳过或修复待处理时返回非零。

## 人工复核

完整报告保留在结果 JSON 的 `cases[].report`，复审及脱敏差异在 `cases[].repair`。人工单独写复核文件，不编辑冻结运行结果：

实际由 Agent 完成源码复核时显式设置 `reviewerKind: "agent"`，输出 `evidenceKind=agent_review`；不填写真人姓名冒充审核。省略此字段保持原人工工具兼容，只有真实人工复核者才能按人工口径使用。公开样例四项已完成绑定源码核对与更正，真人签字状态仍单独保留。

```json
{
  "schemaVersion": 1,
  "runDigest": "原运行结果 JSON 的 SHA-256",
  "reviewer": "实际复核人",
  "reviews": [{
    "caseId": "upstream-webapp-testing",
    "repetition": 1,
    "reportDigest": "对应 case 的 reportDigest",
    "decision": "uncertain",
    "falsePositiveRules": [],
    "falseNegativeRules": [],
    "note": "人工核对的依据及尚未确认的内容"
  }]
}
```

```bash
uv run python3 -m skill_mng.regression_review --run .local/model-run-01.json \
  --reviews /absolute/reviews.json --output .local/human-review-01.json
```

只接受绑定原运行 SHA-256、确切 case/重复号/报告摘要的记录；误报必须对应已确认规则，漏报必须是该深度的活动规则。`accepted`、`rejected`、`uncertain` 由实际复核人填写，不由模型或工具自动生成。新复核产物保存 reviewer、规则计数与待复核数量；不改写原报告、finding ID 或评分。

## dev4：保留修复协议的证据

真实回归定位到 dev3 的通用脱敏会把 JSON 协议中的 `authorization` 对象视作口令赋值，遮掉后续文件证据。dev4 只将发往模型的元数据标签改为 `editScope`，system 提示使用 Frozen edit scope；平台/worker 冻结授权、目标原包检测和通用脱敏规则保持原样。真实 API 协议测试现在解析脱敏后的请求，核对完整授权、SKILL.md 与引用证据，避免只靠固定回复掩盖输入损坏。

## 本轮最终结果

2026-10-25：完整 14 例回执 `regression/baselines/kimi-k28-before-context-fix-2026-10-25.json`（源码 `7eb8571`）得到 13 个自动预期匹配、1 个人工待复核，无审计执行失败、预期不匹配或预算跳过。两次旧修复的未决结果原样保留。dev4 修正后专门重验两例，回执 `regression/baselines/kimi-k28-repairs-2026-10-25.json`（源码 `65aeac3`）显示均 1 轮修复、完整独立复审 117/117 并登记，原包/current/摘要/幂等校验通过。

最终台账 `docs/evidence/KIMI-CALL-LEDGER-2026-10-25.json` 保守占用 **159/256**、剩余 **97**；包含旧中断修复完整 96 次预留，只核回有观测证据的已完成诊断。不能把该保守数当作实际供应商请求或 token 用量。完整 14 例和两类修复重验来自不同源码提交，不声称 dev4 又重跑了全部 14 例；全部真实报告仍待人工复核。完整说明见 [KIMI-REGRESSION.md](KIMI-REGRESSION.md)。
