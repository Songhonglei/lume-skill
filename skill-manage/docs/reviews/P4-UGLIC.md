## UGLIC 检查 — 内置 skill-deep-audit 1.2.0-platform.1

日期：2026-10-24。范围：SKILL.md、全部 references、两个 Python 脚本、README/UPSTREAM/CHANGELOG/LICENSE；连带检查平台 runner、报告接收与 worker 恢复。使用本机 glic-check 1.7.0 的 U/G/L/I/C 检查表。按用户全局授权修复有效问题，无公开发布。

### U — Usability & User Experience

✅ 流程明确：目标、深度、输出目录、静态预检与完整审计的差别、失败后的下一步均写入 SKILL.md“Select the input / 1 / 2 / 3”。机器模式采用 manifest 的明确深度，不重复问用户；没有平台/Hub 依赖。

已修 U1（ERR）：原 SKILL.md 和 output-template.md 要求报告写入目标并宣传 --fix；当前只读实现无法满足。已改为目标外新目录、只读审计和独立语义 evidence 合并；删除虚构自动修复流程。位置：SKILL.md“Boundaries / 3. Deliver”，references/output-template.md。

### G — Grammar

✅ Python AST/ruff、JSON 规则目录、Markdown 引用均检查。frontmatter 只保留 name/description；版本放在正文和 ruleVersion 常量。D6-E7 的历史 ID 虽含 E，级别按上游明确 WARN 保留。

### L — Logic

✅ L1 117/L2 120，规则只扣一次，0 分 ERR 强制 FAIL，必要证据未决阻断 PASS。合成测试覆盖路径索引、变量重绑/跨文件锚点、读取失败和声明版本错配。

已修 L1（ERR）：audit_package.evaluate 将 coverage 收紧为 list 后，runner 仍传 set，导致真实子进程不能保存报告。runner 统一排序转 list，自动回归通过。位置：runner.py 的 freeze_result 调用；tests/test_models_runner.py。

已修 L2（ERR）：worker 正常停止时删除 current.json，且重启覆盖只读 original.zip，无法恢复同 attempt。停止时保留恢复记录、复用已校验原包及冻结结果。真实服务/worker 子进程测试完成同租约重启和取消。位置：worker.py execute/run；tests/test_worker_processes.py。

已修 L3（ERR，平台联动）：端口预检没有 SO_REUSEADDR，将已退出服务的 TIME_WAIT 误判为端口占用。与 Uvicorn 对齐该选项，仍拒绝真实占用端口；wheel 烟测增加停止后同端口立即重启。位置：lifecycle.py start；tests/smoke_wheel.py。

### I — Integrity

✅ standalone manifest 校验目录内容、原 ZIP 与身份；输出 JSON 和 Markdown SHA-256 一致。全规则表与代码共用 rules.json。静态预检 exit 0 不等于 PASS，文档明确。

已修 I1（WARN）：依赖只有英文 Prerequisites 标题，发布检查器识别不到；调整为“依赖与前置条件”，明确 Python 3.11+、stdlib，无需安装第三方包。位置：SKILL.md 依赖章节。

已修 I2（WARN）：scan-commands.md 仍引用旧 Step 2.4 和缺失报告章节。改成只读扫描说明，说明依赖归属、代码量统计和未决项处理。位置：references/scan-commands.md。

### C — Containment

✅ 只执行固定内置检查器，不导入/执行目标；输出目录不得位于目标中；大小/数量/UTF-8 与路径边界均受限。模型只有 read_file，不能访问任意路径、URL、shell 或安装钩子。报告建议不构成修复授权。

已修 C1（ERR）：模型切换 API 地址时空 Key 会沿用旧服务密钥。改为仅同一 base URL 可保留，切换地址清空并重新填写。位置：models.py save_model；Web 模型配置提示。此项为平台联动审查，不修改审计规则消警。

已修 C2（ERR）：分块后才脱敏可能将一个字面凭据切开。先对完整文本进行等长掩码，再按原始 offset 提供片段；覆盖所有 UTF-8 文件。位置：runner.py documents/read。

## 汇总

| 项目 | 初检级别 | 处理与复核 |
| --- | --- | --- |
| U1 / L1 / L2 / L3 / C1 / C2 | ERR | 已修；协议、真实进程与代码复核 |
| I1 / I2 | WARN | 已修；独立入口和发布检查复核 |
| README/CHANGELOG 保留 | INFO / 非问题 | 本项目明确要求来源/许可证与修改记录；这些是上游 fork 分发文档，不删有效归档 |
| frontmatter 无 version | INFO / 非阻断 | GitHub 目标不要求；正文与机器 ruleVersion 已明确，不因检查器建议增加多余元数据 |

本次复核无未解决 ERR/WARN。真实模型语义正反例未执行，等待管理员配置服务；协议 fixture 和静态报告不替代该验收。
