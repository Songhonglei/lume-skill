## UGLIC 检查 — 0.3.0 授权修复与独立复审

日期：2026-10-24。使用 glic-check 1.7.0 的 U/G/L/I/C 检查表，范围为 add7542 后的平台、迁移、UI 与验收脚本。按用户既有授权直接修复有效问题；无公开远端发布。内置独立 Skill 文件未变，沿用 P4 的 UGLIC 与 skill-release-audit 记录。

### U — Usability & User Experience

✅ 审计问题默认勾选 ERR；授权弹窗优先展示目标版本、登记与 current 选项，额外路径和轮数放在更多设置。任务详情分开呈现执行、修复、复审、差异与剩余问题；失败不显示为已发布。位置：static/app.js 的 openRepair / repairTaskDetail。

已修 U1（WARN）：目标版本默认固定 patch+1，已有该版本时首次提交冲突。现在根据已登记版本选择未占用 patch；API 仍处理并发冲突，不能覆盖已有包。位置：static/app.js 修复授权弹窗。

### G — Grammar

✅ Python ruff format/check、JavaScript 语法检查通过；004_repairs.sql 在全新初始化、升级与恢复测试中应用。示例 scripts/greet.py 故意含未闭合字典，供真实负例审计，不当作平台源码执行或修平。

### L — Logic

已修 L1（ERR）：模型曾将“规则已经满足”写入问题列表，错误阻断复审。runner.py:17 的 semantic_consistency 要求每条活动规则恰一次 pass/fail/review，并与 outstanding findings 一致；不一致需纠正或待复核，不通过删除发现伪造 PASS。

已修 L2（ERR）：候选完整复审的读文件阶段与严格 JSON 输出混用，部分兼容服务提前 final 或重复调用。execution_api.py 模型代理把读证据与输出 schema 分阶段；未读完整文件不进入结论；小文件在 60 KB 上限内一次提供完整取证内容，实际提供的区间才计入覆盖，大文件继续受限分块。修复编辑使用 auto 工具选择及 finish_edit，拒绝工具越界；设置 parallel_tool_calls=false，超量调用只保留待处理结果。

已修 L3（WARN）：非 JSON、null content 或 status 为数组会触发通用 checker_error。runner.py:17/92 验证类型并保留待复核，repair_runner.py:90 返回明确待处理原因；工具批次、上下文和调用次数均有限。对应反例 tests/test_models_runner.py。

✅ 最多 3 轮、先保存候选再新会话复审、保存报告后不可重新评分覆盖；重启先读取回执，复用冻结候选和结果。位置：repair_runner.py run_repair；repairs.py:216/316。

### I — Integrity

已修 I1（ERR）：P4 验收文档仍声称模型未配置、P5 未实现；0.3.0 VALIDATION、PLAN、DEVELOPMENT-PLAN、OPERATIONS 和 contracts 按实际成功及失败分别更新，不把协议 fixture 当作真实模型证据。

✅ 复审 manifest 绑定 plannedVersionId、候选双摘要、repairRound、sourceVersionId 和授权快照，Markdown SHA-256 与 JSON 一致；新版本及最终审计台账同事务保存。SQLite trigger 反例验证回滚。位置：repairs.py review_manifest / _publish；tests/test_repairs.py。

### C — Containment

已修 C1（ERR）：分块脱敏无法遮住跨块凭据；先对整个 UTF-8 文本做等长掩码再分块，并将凭据证据标为待复核。位置：runner.py documents / repair_packages.py redact。模型 Key 只在平台代理使用，不传 worker，不入备份和镜像。

✅ 原包只读、候选在内存与独立目录，固定工具不运行目标代码；服务器再次校验路径授权与只改版本的 SKILL.md。最终 Gate 校验原授权者仍有权、当前指针及最新版本未变化、选定问题清除、完整复审 PASS、范围通过、摘要与任务终态。位置：repairs.py:216/350/394/455；tests/test_repairs.py 的越界、撤销、取消、篡改、冲突和重复发布反例。

## 汇总

| 项目 | 初检级别 | 处理与复核 |
| --- | --- | --- |
| U1 | WARN | 默认版本避让，真实 UI 与 API 冲突分支复核 |
| L1 / L2 / I1 / C1 | ERR | 已修；真实模型、协议反例、文档及源码复核 |
| L3 | WARN | 已修；无效 JSON/null/status/超量调用反例通过 |
| 模型服务不遵守工具协议或预算耗尽 | 外部行为 / 非误报 | 进入待复核或待处理；不降低 Gate，不无限重试 |
| 内置 Skill README/CHANGELOG/LICENSE | 非问题 | 来源许可与 fork 记录按项目要求保留；本轮资源无改动 |

复核无未解决的代码 ERR/WARN。运行环境、真实模型重复性和未覆盖平台按 VALIDATION.md 如实列出。
