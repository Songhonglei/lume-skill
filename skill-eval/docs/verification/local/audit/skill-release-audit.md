# skill-release-audit 复核

2026-10-24。执行默认只报告模式，没有自动安装审计依赖，没有修改检查器规则。应用主项目不是一个 Agent Skill，根目录无 SKILL.md，检查器按契约退出 2（“不是有效的 skill 目录”）；这项为 N/A，不伪造入口绕过。应用代码由 UGLIC、PG 测试、真实模型链路、构建与公开候选扫描验证。

对实际随附的 Skill 目录执行全部六模块，完整输出保留：

- [vendor-before.json](vendor-before.json)：0 ERR、27 WARN。
- [vendor-after.json](vendor-after.json)：0 ERR、18 WARN。
- [example.json](example.json)：0 ERR、3 WARN。

## 实际问题已修复

原始 findings 的 `code` 字段为空，位置为 SKILL.md，原分类为 WARN。涉及 `references/install.md`、`references/observations.md`、`references/migrate-anthropic.md`、`references/cli.md` 的“不存在文件”是实际缺失，已从同一上游提交补齐。9 条重复引用警告一并消除，UPSTREAM.json 新增各文件 SHA256；没有改写原有指令、判分模板或关闭检查。

## 保留的误报与理由

以下保持机器原分类与原始内容，在本次人工复核中判定不构成实际缺陷，不计入实际 WARN：

| 原分类 / code | 位置与提示 | 判断依据 |
| --- | --- | --- |
| WARN / 空 | vendor SKILL.md：“引用了不存在的文件” eval.yaml、case.yaml、evals.json、evals/eval.yaml、evals/evals.json、.skill-up.yaml、result.json、benchmark.json、grading.json；共 17 条含重复 | 这些名称在布局、命令与产物说明中描述用户任务输入或运行时输出，不是 vendor 包内应预置的资源。实际模板位于 assets/，案例在任务目录生成，原始结果由 CLI 运行产生；补造空文件反而会误导执行。逐条原记录见 vendor-after.json。 |
| WARN / 空 | vendor assets/eval.yaml.tmpl:75：“遗留标记: #     - \"TODO\"” | 这是上游注释中的规则示例，表示输出不可含 TODO，不是未完成实现；文件摘要与固定上游一致。 |
| WARN / 空 | example SKILL.md：“正文内容过少”“description 过短（18 字符）”“建议包含使用场景”；共 3 条 | 合成 Skill 故意只做 LABEL: 文本标记，正文已完整说明触发、精确输出、原文保留、空输入及禁止联网/命令。真实规则/脚本/语义裁判和正常/缺陷变体均验证该约定，增加无关流程不会改善可执行性。 |
| INFO / 空 | vendor SKILL.md：外部 ~/.skill-up/credentials.yaml；共 2 条 | 工具已正确识别为用户环境路径；产品执行使用隔离登录副本，不把该文件作为包内依赖。 |
| INFO / 空 | vendor SKILL.md：缺少 version | generic 目标不要求 version；固定来源提交与文件摘要由 UPSTREAM.json 记录，不修改第三方原文。 |

没有 ENV_OPTIONAL_OVERRIDE / ENV_RUNTIME_INJECTED / ENV_AMBIENT 项被提升为 WARN/ERR，也没有因读取环境变量就添加虚构的 metadata。

六模块结果：模块 1 保留上述文档名称与模板误报，模块 2–5 对 vendor 为 PASS，模块 6 为 PASS（有可选版本 INFO）；合成示例的模块 2/6 提示按上述理由保留。实际缺失已修复，相关安装包重新打包和校验。

后续已明确项目 MIT 及 lume-skill 合集目标；2026-10-24 增量复核仍为 vendor 0 ERR / 18 WARN、合成示例 0 ERR / 3 WARN，逐项误报依据不变。正式发布仍需目标容器/平台验收。该检查通过不意味着已经公开、已经发布镜像或完成容器实测。
