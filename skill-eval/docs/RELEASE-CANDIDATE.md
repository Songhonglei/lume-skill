# 发布候选资料

本项目仍为 **0.1.0 开发候选**。这里准备可审阅的源码、Worker 包、来源和部署材料，不创建标签、Release 或公开镜像。文件摘要证明产物身份，不证明平台、模型或法律审计全部通过。

## 产物与来源

| 产物 | 内容与核对方式 |
| --- | --- |
| 源码候选 ZIP | 固定 Git 提交中的 skill-eval/、本应用两份工作流与共享品牌资产；不包含 skill-manage 或本地运行目录 |
| macOS arm64 Worker ZIP | 由同一提交的 deploy/build_worker.py 白名单打包，带应用、固定编写资产、安装器、工具清单和许可；不带运行时或登录 |
| Linux x86_64 Worker ZIP | 同一白名单、平台标识不同；只构建并静态核对，原生平台安装与真实模型验收暂缓 |
| SHA256SUMS 与候选清单 | 记录完整源码提交、每包大小/摘要、逐文件摘要、固定版本与验收边界；重复构建一致性单独记录 |
| 容器镜像 | 当前只有历史本地/CI 构建证据，本次候选不包含已发布镜像或多架构镜像索引 |

所有产物在新的本地候选目录生成，保留原有包，不覆盖历史检查点。公开仓库只记录脱敏清单和验证摘要，ZIP 留在本地待审阅。具体候选身份由本页后续链接的收据确定，不把“当前 main”当作可变的产物身份。

来源与许可入口：[应用 MIT](../LICENSE)、[第三方 notices](../THIRD-PARTY-NOTICES.md)、[源码与依赖来源](SOURCE-INVENTORY.md)、[固定工具与官方二进制摘要](../deploy/toolchain.json)、[编写资产及摘要](../vendor/skill-upper/UPSTREAM.json)、[seccomp 来源](../deploy/worker-seccomp.SOURCE.json)。Python、Node 依赖由锁文件和带哈希 requirements 固定；现有[依赖许可元数据](verification/local/dependency-licenses.json)属于历史环境清单，不代替新安装环境或发布镜像的依赖清单。

## 拟支持范围与实际证据

| 范围 | 证据状态 | 发布材料中的表述 |
| --- | --- | --- |
| macOS arm64 独立 Worker | 历史包有安装、模型和裁判证据；新候选包需要单独核对安装身份 | 已有历史验证；新包的实测状态另列 |
| Docker Desktop ARM64 | 沙箱、Pro、三类裁判、生成/复用、备份恢复有历史收据 | 已验证的宿主/镜像检查点，不保证任意新镜像均通过 |
| Linux x86_64 | 无模型 CI 和 amd64 模拟部分证据；原生真实模型验收用户暂缓 | 未完成原生验收，不标为已验证 |
| Podman arm64 | 历史 devpts/沙箱故障仍保留 | 不在已验证运行时范围中 |
| Windows 原生 | 一期不支持 | 不提供原生 Worker 包 |

完整范围见[验收矩阵](verification/local/acceptance.md)。发布时由用户确定实际覆盖平台，不因生成了某个平台 ZIP 就声明该平台支持已验收。

## 安装与登录

源码 ZIP 解压后进入 lume-skill/skill-eval。需要运行中心时按 [README](../README.md) 启动 Compose；首次先确认目标端口和项目/卷归属，不覆盖已有部署。仅整理源码或检查文件不需要启动 Docker。

Worker ZIP 先核对 SHA256，解压后按随包 [WORKER](WORKER.md) 安装到新应用目录。Python 3.11+；私有 Codex 安装需要 Node/npm。固定 skill-up 0.14.0 / Codex CLI 0.162.1。登录使用独立目录或专用卷，接入后选择 Worker 连接和模型，再显式执行连接检查；“有登录文件”不代表授权仍有效。

连接中心需要管理员初始化/登录与 Worker 单次接入码，模型登录另在 Worker 完成；这三者不互相替代。源码、ZIP 和候选清单不包含原管理员密码、历史数据库、Worker 令牌或模型凭据。

## 升级、备份与回滚

1. 等任务结束，停止写入者；按[运维说明](OPERATIONS.md#配套备份)保存同一备份点的 PostgreSQL custom dump 与 center、worker、model、database、builtin 五个文件 root。
2. 核对备份 manifest 和摘要。备份含秘密，只保存在私有受限目录，不进入 Git、Release 或候选 ZIP。
3. 用新目录/新镜像和新项目/空卷做恢复验证；先恢复文件与权限，再启动 init/db、导入 PG，最后启动 api/worker。不要让新旧中心同时使用同一 Worker 状态。
4. 确认资源、启用版本、历史任务和原报告摘要，再切换实际服务。当前只有 schema v1，没有已验证的跨 schema 升级路径。
5. 失败时先停止新环境，保留诊断；回到匹配旧代码/镜像与配套备份的环境，不用旧程序覆盖未知新 schema。未执行某一候选的升级/回滚时，清单保持 NOT_RUN。

关闭时只停止服务和 Docker Desktop，保留卷；不执行 down -v。日常不要求 Docker 常驻，联调完成后释放内存。

## 发布决定前

候选摘要、来源许可、平台说明与部署步骤先齐备；再按具体缺口补复杂脚本/附件、模型登录失效及中心不可达验证。每项绑定代码、安装来源、原始报告与恢复结果，不重复未受影响的整套矩阵，也不把模拟/故障注入说成自然 OAuth 到期。

随后整理候选版本、拟发布平台、剩余风险、发布步骤和回滚材料，供用户确定范围。正式版本号、Git 标签、Release、GHCR 推送和公开资产的新环境重装均在范围确定后执行。尚缺的外部审计工具如实记未运行。
