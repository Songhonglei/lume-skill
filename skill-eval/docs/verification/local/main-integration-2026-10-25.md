# 本轮源码整合到 main

日期：2026-10-25（Asia/Shanghai）。用户决定暂缓原生 Linux x86_64 验证，并将本轮开发分支整合到 main。该平台维持 NOT_RUN/PARTIAL；本次决定不包括正式 Release、镜像发布或其他未测平台的验收放行。

## 合并范围

- 案例编辑器：异常 YAML 安全回退源码编辑；BOM、二进制附件保真；同名附件替换确认；异步操作期间保护编辑上下文和保存版本，避免旧快照回写。
- Worker：沙箱自检显式使用 workspace-write；Compose 使用固定来源有限 seccomp、cap-drop ALL、非 root 和 no-new-privileges；401/403 接入失效以失败退出。
- 分发与检查：白名单包包含 seccomp 来源及许可证，源文件扫描校验摘要，CI 执行前端回归测试。
- 实测记录：编辑器浏览器边界、Docker 安装与沙箱、Linux amd64 模拟安装接入、Harness 失败边界，以及 Pro 独立登录的 ARM64 Docker 真实模型和配套恢复证据。

当前开发起点为 `eca5e692c142d0305d4dd5ef1029874720715d7e`。合并前已获取远端 main 的新增历史；该批远端改动位于 skill-manage 及其工作流，和本轮文件无交叉。本次不修改或撤回这些独立项目的内容。

## 合并前检查

当前候选重新运行且通过：Python / PostgreSQL 45 项、前端 Node 19 项、TypeScript / Vite 生产构建、Ruff、公开候选扫描、Compose 配置及 diff 检查。根目录工作流 YAML 已单独解析并确认包含前端测试步骤。机器摘要见 [main-integration-2026-10-25.json](main-integration-2026-10-25.json)。历史真实模型收据不冒充本轮重复推理，main 上的远端 CI 与本地检查分开记录。

参考：[编辑器实测](continuation-2026-10-25.md)、[Docker 安装与安全](docker-worker-2026-10-25.md)、[Pro Docker 模型与恢复](pro-docker-e2e-2026-10-25.md)。

提交和合并身份以 Git 历史为准。运行凭据、模型登录、设备码、cookie、完整模型日志和含登录资料的备份均位于忽略的私有目录，不属于本次源码整合内容。
