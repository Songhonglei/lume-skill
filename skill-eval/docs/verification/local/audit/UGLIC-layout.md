## UGLIC 检查 — Skill Eval 根目录布局

2026-10-24。按用户明确要求去掉中间 projects 层，应用直接位于合集根目录下的 `skill-eval/`。范围仅为目录移动、工作流及文档路径同步，不改变应用逻辑、依赖、数据或服务。

### U — Usability & User Experience

✅ 根 README 的项目入口、应用 README、`AGENT-HANDOFF.md §1/6/11/12` 的目录/启动命令/接手指令均指向 `skill-eval/`。下载后的命令为 `cd lume-skill/skill-eval`，不再经过中间目录。

### G — Grammar

✅ Markdown 本地链接与代码围栏检查通过，`git diff --check` 通过。两份 workflow 的 working-directory、检查工作流的 paths 和 npm cache-dependency-path 已同步。没有新增依赖或可执行程序。

### L — Logic

✅ `.github/workflows/skill-eval-checks.yml` 从新项目目录构建、测试并执行 Compose；镜像工作流也使用相同新目录。Docker context 仍为应用目录自身，COPY 的相对位置不变。`compose.yaml` 显式项目名和命名卷配置不变，目录移动不用于启动或迁移已有服务。镜像发布仍为手动，不在本轮运行。

### I — Integrity

✅ 150 个原有项目文件全部迁移，逐文件 Git blob 比较确认内容变化只涉及 5 份项目文档，应用代码、锁文件、测试、部署文件及品牌副本均未改变。根 README 和两份 workflow 是额外的必要路径同步。

✅ 新目录重新打包得到的两个 Worker ZIP 与历史修订包 SHA256 完全一致：Linux `f4b76f2026e4c2f406cf703b7ed6512029aad9af45dfed1c94b3d0ed97ddaf6d`；Mac `b0b4a7ed3667d40785fec6142a6b587589e3008be3486007f6bcb77b84967601`。没有文件缺失。

✅ 历史 `verification/local/checks.json` 的 project_subdirectory 保留原检查点，`AGENT-HANDOFF.md §4` 明确当前目录与历史快照差异；没有把路径调整改写成模型/平台验收。

### C — Containment

✅ 公开候选扫描通过；应用业务、依赖和运行状态不变。仅删除已空的中间目录，没有清理用户数据。项目外的合集品牌资产不移动，应用仍自带构建需要的副本；未新增模型调用、发布镜像或正式 Release。

## Skill 审计复核

实际随附 vendor/skill-upper 与 examples/label-text 均重跑六模块，JSON 与 `vendor-after.json`、`example.json` 完全一致：分别 0 ERR / 18 机器 WARN、0 ERR / 3 机器 WARN。沿用 [skill-release-audit.md](skill-release-audit.md) 的逐项误报依据，没有新问题。应用本身不是 Skill，根目录 NotSkill 检查仍为 N/A。

## 汇总

| 维度 | 结果 |
| --- | --- |
| U | 项目入口与接手命令同步 |
| G | 链接、代码围栏、差异格式检查通过 |
| L | CI/镜像工作目录、触发路径和缓存路径同步 |
| I | 150 个文件完整，应用内容与 Worker 包保持一致 |
| C | 仅布局及相关文档，无服务/数据/模型副作用 |

无未解决的实际 ERR/WARN。完整远程 CI 随本次 PR 执行；未完成的 Docker 真实模型验收保持原状态。
