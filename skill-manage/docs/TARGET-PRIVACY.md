# T01：目标文本隐私策略

2026-10-25，本地开发版本 0.3.2.dev0，schema 仍为 4。历史 0.3.1 发行物及已保存报告不改写。

## 行为

- 对包内所有 UTF-8 文本先做全文检查，包括超过 256 KiB 模型读取上限的文件。发现疑似凭据后不向外部模型发送该包的任何上下文，审计仅保留静态结果及 D5-W3 待复核位置（最多展示 100 个位置；静态问题超过 350 项时截断并追加待复核说明）。既有静态 ERR 仍可使结论为 FAIL，不能声明完整 PASS。
- worker runner 和 Web 模型代理分别检查；代理阻断时不消耗模型调用次数。修复进入 `needs_attention / target_credentials_require_review`；服务端拒收含疑似凭据的原包修复候选、新增凭据候选和通过报告，发布门禁也重新检查候选。
- 示例口令、`YOUR_TOKEN_HERE`、带引号的环境变量占位文本同样需复核。不提供“一键忽略并发送”开关。报告位置指向原文件；在本地确认并移除字面量或改为运行时读取环境变量，作为新版本导入。未知表达式保守处理。
- 文本视图先等长遮蔽再分块，保留 CR/LF、字符偏移和原始文件摘要。差异使用修改前后所有文件收集的值，同时遮蔽上下文行的重复值。模型消息在 Web 端额外按结构脱敏，错误只返回稳定码。
- 含疑似凭据的候选写入和删除整体阻断，不能将模型看到的 `***` 写回为真实内容。原 ZIP、文件字节和 content/artifact digest 不变；报告先遮蔽说明再生成 finding ID、Markdown 和摘要。服务端重建并拒收不安全的新报告，不改写冻结报告来适配摘要。

## 识别范围和边界

`src/skill_mng/privacy.py` 是平台附加保护，未修改独立内置 Skill 的规则、脚本或规则版本；独立使用内置 Skill 时仍是原来的较窄检测范围。

覆盖以 api_key、access_key/id、secret_key、token、secret、password、passwd、passphrase、pwd、private_key、authorization、credential(s) 结尾的字段，支持前缀、大小写、常见 camelCase；覆盖 `.env` 无引号值、JSON/YAML 带引号值、冒号后换行、YAML `|`/`>` 块、三引号、转义引号及常见 PEM 私钥体（缺 END 时遮蔽至结尾）。非空赋值没有原来的 20 字符下限。

明确的无默认值环境引用（如 `os.getenv("API_KEY")`、`os.environ["PASSWORD"]`、`process.env.ACCESS_TOKEN`、未加引号的 `$VAR`/`${VAR}`）不含凭据字面量，可继续检查；硬编码默认值会阻断。无引号值保守遮蔽至行尾，因此可能连注释一起隐藏。空值、`null`、`None` 不单独视为凭据。

已识别值的跨位置替换仅用于长度至少 4 字符的值，避免单字符口令破坏编号等信息；更短值仍在赋值区间遮蔽并阻断整个模型调用。报告与差异的文件路径保持原定位；路径、摘要、分数或编号碰巧含相同字符不视为正文泄露。

这不是任意秘密检测器：未知字段名、裸值、拆分/编码/混淆凭据、二进制内容或业务敏感语义不保证识别。原包下载和登录成员的原文件预览保留原文，它们不是脱敏副本。已有数据库报告与历史 worker 缓存不自动清洗，需按实际保留政策另行处置。不要将检测未命中解释为允许上传任意真实敏感资料。

## 复查

```bash
uv sync --extra dev --locked
uv run pytest -q tests/test_privacy.py
uv run pytest -q
uv run ruff check src tests
uv run ruff format --check src tests
node --check src/skill_mng/static/app.js
git diff --check
```

`tests/test_privacy.py` 全部使用合成文本和协议 fixture，覆盖格式、分块、跨文件差异、原始摘要、无模型调用、服务端独立阻断、报告拒收/重传及候选门禁，不执行目标代码，不调用收费模型。它不代替 T02 的真实语义回归、T03 的跨机器 HTTPS 或 T04 的专用 CI。
