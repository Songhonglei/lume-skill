# 源码与依赖来源

本仓库从空目录初始化；不迁入其他工作区的 Git 历史或业务文件。

| 内容 | 来源与处理 |
| --- | --- |
| 产品、技术、开发和验收文档 | 本项目已确认的范围 |
| backend / worker / frontend / deploy | 在本仓库新编写；参考已有工作台的信息密度与浅色视觉，不复制其业务实现 |
| 合成示例 | 本项目新编写的文本格式化任务，不使用真实业务材料 |
| skill-up | Apache-2.0，固定 v0.14.0，官方发布包 SHA256 见 deploy/toolchain.json |
| Worker 容器 seccomp | openai/codex-security 固定提交的原始配置，Apache-2.0；来源、SHA256 与许可证见 deploy/worker-seccomp.SOURCE.json |
| skill-upper 案例编写指令 | 上游同一提交的固定资产，仅用于生成候选案例；不安装观察器或自我修复流程 |

第三方指令资产保留原始许可及摘要。测试登录配置与原始运行记录位于被忽略的本地区域，不进入源码。用户已指定公开目标为 Songhonglei/lume-skill 的 skill-eval 子目录，并确认原创代码采用 MIT；候选源码接入与正式版本发布分别记录，不能据此宣称平台验收完成。

当前候选的源码提交、源档/Worker ZIP 摘要与完整逐文件清单见[11/03 候选收据](verification/local/release-candidate-2026-11-03.json)，实际安装依赖元数据见[当前候选许可清单](verification/local/candidate-licenses-2026-11-03.json)。它们分别说明源档身份、安装来源和适用平台的依赖信息；不把元数据清单当作完整镜像 SBOM 或外部发布审计。未适用本机的环境 marker 另列。
