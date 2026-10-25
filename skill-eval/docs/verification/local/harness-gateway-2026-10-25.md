# Harness 网关与 Worker 模型连接增量

日期：2026-10-25（Asia/Shanghai）。本地验证，尚未推送或发布。

本次检查时 Harness 已在 `127.0.0.1:8326` 监听，原有 API Key 可以认证。不需要再打开开关，本次没有改动 Harness 配置或模型服务的访问限制。密钥只在内存和容器进程中使用，没有写入仓库、镜像或命令参数；未读取宿主 Codex 登录资料。

| 检查 | 结果 |
| --- | --- |
| 已有密钥获取网关模型列表 | PASS |
| 最小 Responses 请求，`buddy/glm-5.3-flash` | PASS；HTTP 200、completed，返回 CONNECTION_OK |
| ARM64 容器通过 host.docker.internal 访问模型列表 | PASS |
| 非 root、cap-drop ALL、no-new-privileges、有限 seccomp 下的沙箱检查 | PASS |
| 同一容器实际执行 Worker.probe → 固定 Codex 0.162.1 | FAIL；两次探针均未返回成功 |
| 独立 Codex 诊断命令 | FAIL；上游拒绝：Illegal API invocation from an unapproved channel |
| 已配置替代通道 xhsmaas-gpt/gpt-6-luna、codearts/glm-5.3-flash 的最小请求 | FAIL；均返回 HTTP 502 |

最小文本请求成功不能算作 Worker 或评测通过。当前 buddy 通道拒绝 Codex 请求，未尝试伪装客户端、修改身份或绕过通道限制。CLI 自身发生了重连尝试，因此本记录不把命令数当作精确的上游推理次数，也不将失败请求计为成功推理。服务端模型身份未独立核实。

已重新启动 Docker Desktop；本次临时探针容器均自动移除，未启动原有中心验证项目。后续仍需可接受 Codex 请求的模型通道，再补 Docker 三类裁判、生成及复用。原生 Linux x86_64 和配套恢复验证仍未完成。

脱敏机器收据见 [harness-gateway-2026-10-25.json](harness-gateway-2026-10-25.json)。本记录补充此前 Docker 检查点；不改写此前“该轮模型请求为 0”的历史结果。
