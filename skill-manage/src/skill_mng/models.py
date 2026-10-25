"""Administrator-configured compatible model service. No endpoint is accepted from a worker."""

import json
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from .auth import new_id, now
from .config import write_secret_json
from .db import transaction
from .registry import storage_lock


class ModelError(RuntimeError):
    def __init__(self, code: str, retryable: bool = False):
        self.code, self.retryable = code, retryable
        super().__init__(code)


def model_config(root: Path) -> dict:
    path = root / "model-config.json"
    return json.loads(path.read_text()) if path.exists() else {}


def public_model_config(root: Path) -> dict:
    config = model_config(root)
    return {
        "configured": bool(config.get("base_url") and config.get("model")),
        "ready": bool(config.get("ready")),
        "base_url": config.get("base_url", ""),
        "model": config.get("model", ""),
        "reasoning_effort": config.get("reasoning_effort"),
        "api_key_configured": bool(config.get("api_key")),
        "revision": config.get("revision"),
        "checked_at": config.get("checked_at"),
        "failure_code": config.get("failure_code"),
    }


def save_model(
    root: Path,
    base_url: str,
    model: str,
    api_key: str | None = None,
    reasoning_effort: str | None = None,
) -> dict:
    parsed = urlsplit(base_url.strip())
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("模型服务地址需为不含凭据和查询参数的 HTTP(S) API Base URL")
    if not model.strip() or len(model) > 160 or len(base_url) > 2048:
        raise ValueError("请填写有效的服务地址与模型名")
    if api_key is not None and (len(api_key) > 4096 or "\n" in api_key or "\r" in api_key):
        raise ValueError("模型密钥格式不正确")
    if reasoning_effort not in (None, "low", "medium", "high", "max"):
        raise ValueError("模型思考程度无效")
    with storage_lock(root):
        previous = model_config(root)
        write_secret_json(
            root / "model-config.json",
            {
                "base_url": base_url.strip().rstrip("/"),
                "model": model.strip(),
                "reasoning_effort": reasoning_effort,
                "api_key": api_key
                if api_key is not None
                else (
                    previous.get("api_key", "")
                    if previous.get("base_url") == base_url.strip().rstrip("/")
                    else ""
                ),
                "revision": new_id(),
                "ready": False,
            },
        )
    return public_model_config(root)


def completion(config: dict, payload: dict, *, timeout: int = 40) -> dict:
    if not config.get("base_url") or not config.get("model"):
        raise ModelError("model_not_configured")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.get("api_key"):
        headers["Authorization"] = "Bearer " + config["api_key"]
    options = {"reasoning_effort": config["reasoning_effort"]} if config.get("reasoning_effort") else {}
    body = json.dumps(
        {**payload, **options, "model": config["model"], "stream": False, "max_tokens": 6000}
    ).encode()
    request = urllib.request.Request(config["base_url"] + "/chat/completions", data=body, headers=headers)

    # Do not forward credentials through redirects or environment proxies.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ModelError("model_response_too_large")
        result = json.loads(raw)
        choice = result["choices"][0]
        if not isinstance(choice, dict):
            raise ValueError("invalid choice")
        if choice.get("finish_reason") == "length":
            raise ModelError("model_output_truncated")
        message = choice["message"]
        if not isinstance(message, dict):
            raise ValueError("invalid message")
        return message
    except urllib.error.HTTPError as exc:
        raise ModelError("model_http_" + str(exc.code), exc.code == 429 or exc.code >= 500) from None
    except (OSError, urllib.error.URLError) as exc:
        if isinstance(exc, TimeoutError) or isinstance(getattr(exc, "reason", None), TimeoutError):
            raise ModelError("model_timeout", True) from None
        raise ModelError("model_network_error", True) from None
    except (ValueError, KeyError, IndexError, TypeError):
        raise ModelError("model_invalid_response") from None


def probe_model(root: Path) -> dict:
    config = model_config(root)
    schema = {
        "type": "object",
        "properties": {"ok": {"type": "boolean"}},
        "required": ["ok"],
        "additionalProperties": False,
    }
    messages = [
        {
            "role": "user",
            "content": "Call capability_check now with value ok. You must use the provided function tool. Do not answer directly or return JSON before the tool is called; its result is not available yet.",
        }
    ]
    try:
        first = completion(
            config,
            {
                "messages": messages,
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "capability_check",
                            "description": "Return a capability test value.",
                            "parameters": {
                                "type": "object",
                                "properties": {"value": {"type": "string", "enum": ["ok"]}},
                                "required": ["value"],
                                "additionalProperties": False,
                            },
                        },
                    }
                ],
                # Thinking models may reject a forced tool choice. Still require
                # the exact tool name and arguments in the response below.
                "tool_choice": "auto",
            },
        )
        calls = first.get("tool_calls", [])
        if (
            len(calls) != 1
            or calls[0]["function"]["name"] != "capability_check"
            or json.loads(calls[0]["function"]["arguments"]) != {"value": "ok"}
        ):
            raise ModelError("tools_not_supported")
        messages.extend(
            [
                first,
                {"role": "tool", "tool_call_id": calls[0]["id"], "content": '{"ok":true}'},
                {
                    "role": "user",
                    "content": "Return the supplied tool result as JSON matching the response schema.",
                },
            ]
        )
        second = completion(
            config,
            {
                "messages": messages,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": "capability_result", "strict": True, "schema": schema},
                },
            },
        )
        if json.loads(second.get("content", "")) != {"ok": True}:
            raise ModelError("structured_output_not_supported")
        ready, failure = True, None
    except (ModelError, KeyError, TypeError, ValueError) as exc:
        ready, failure = False, exc.code if isinstance(exc, ModelError) else "capability_invalid_response"
    with storage_lock(root):
        current = model_config(root)
        if current.get("revision") != config.get("revision"):
            raise ValueError("检测期间配置已改变，请重新检测")
        current.update(ready=ready, checked_at=now(), failure_code=failure)
        write_secret_json(root / "model-config.json", current)
        if ready:
            with transaction(root, write=True) as db:
                for row in db.execute(
                    "SELECT id,manifest_json FROM tasks WHERE state='waiting_configuration'"
                ).fetchall():
                    manifest = json.loads(row["manifest_json"])
                    manifest["modelRevision"] = current["revision"]
                    db.execute(
                        "UPDATE tasks SET state='queued',manifest_json=? WHERE id=?",
                        (json.dumps(manifest), row["id"]),
                    )
    return public_model_config(root)
