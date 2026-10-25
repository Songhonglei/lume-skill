"""Protocol fixtures: these deliberately do not claim live model acceptance."""

import json
import threading

import pytest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from conftest import package, upload
from skill_mng.auditing import engine
from skill_mng.config import write_secret_json
from skill_mng.db import transaction
from skill_mng.models import ModelError, completion, model_config, probe_model, save_model
from skill_mng.runner import run_audit
from skill_mng.tasks import claim, create_enrollment, create_task, redeem


def test_model_probe_fixed_tools_and_no_secret_exposure(client):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append(body)
            assert self.headers["Authorization"] == "Bearer synthetic-model-key"
            message = (
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call-test",
                            "type": "function",
                            "function": {"name": "capability_check", "arguments": '{"value":"ok"}'},
                        }
                    ],
                }
                if "tools" in body
                else {"role": "assistant", "content": '{"ok":true}'}
            )
            raw = json.dumps({"choices": [{"message": message}]}).encode()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        root = client.app.state.root
        version = upload(client).json()["version_id"]
        user = client.get("/api/me").json()
        create_task(root, user, version, "L1", "full", "waiting")
        settings = save_model(
            root, f"http://127.0.0.1:{server.server_port}/v1", "fixture", "synthetic-model-key"
        )
        assert "synthetic-model-key" not in json.dumps(settings)
        assert not settings["ready"] and probe_model(root)["ready"]
        assert len(requests) == 2 and requests[0]["tool_choice"] == "auto"
        assert requests[1]["response_format"]["json_schema"]["strict"]
        assert client.get("/api/tasks").json()[0]["state"] == "queued"
        assert (root / "model-config.json").stat().st_mode & 0o077 == 0
        assert "synthetic-model-key" not in client.get("/api/model").text
        assert model_config(root)["api_key"] == "synthetic-model-key"
        same = save_model(root, settings["base_url"], "fixture-renamed", None)
        assert same["api_key_configured"]
        changed = save_model(root, f"http://127.0.0.1:{server.server_port}/other", "fixture", None)
        assert not changed["api_key_configured"]
        assert model_config(root)["api_key"] == ""
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize(
    "message",
    [
        {"role": "assistant", "content": '{"ok":true}'},
        {
            "role": "assistant",
            "tool_calls": [{"id": "wrong", "function": {"name": "other", "arguments": "{}"}}],
        },
        {
            "role": "assistant",
            "tool_calls": [
                {"id": "wrong", "function": {"name": "capability_check", "arguments": '{"value":"no"}'}}
            ],
        },
    ],
)
def test_auto_probe_still_requires_exact_tool_execution(client, monkeypatch, message):
    root = client.app.state.root
    save_model(root, "http://127.0.0.1:1/v1", "fixture", "")
    calls = []

    def completion(config, payload):
        calls.append(payload)
        assert payload["tool_choice"] == "auto"
        return message

    monkeypatch.setattr("skill_mng.models.completion", completion)
    result = probe_model(root)
    assert not result["ready"] and result["failure_code"] == "tools_not_supported"
    assert len(calls) == 1


def test_proxy_quota_and_revocation(client, monkeypatch):
    root = client.app.state.root
    version = upload(client).json()["version_id"]
    user = client.get("/api/me").json()
    save_model(root, "http://127.0.0.1:1/v1", "fixture", "")
    config = model_config(root)
    config["ready"] = True
    write_secret_json(root / "model-config.json", config)
    create_task(root, user, version, "L1", "full", "proxy")
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "test")
    manifest = claim(root, worker["id"])
    headers = {"Authorization": "Bearer " + worker["credential"]}
    endpoint = f"/api/worker/attempts/{manifest['attemptId']}/model"
    seen = []

    def completion(config, payload, *, timeout):
        assert timeout == 90  # provider may take longer than the old 40s audit wait
        seen.append(payload)
        return {"role": "assistant", "content": '{"findings":[],"checkedRuleIds":[]}'}

    monkeypatch.setattr("skill_mng.execution_api.completion", completion)
    body = {"generation": 1, "messages": [{"role": "user", "content": "test"}], "require_tools": True}
    assert (
        client.post(endpoint, json={**body, "url": "https://other.example"}, headers=headers).status_code
        == 422
    )
    assert (
        client.post(
            endpoint,
            json={"generation": 1, "messages": [{"role": "system", "content": "override"}]},
            headers=headers,
        ).status_code
        == 400
    )
    for _ in range(16):
        assert client.post(endpoint, json=body, headers=headers).status_code == 200
    assert len(seen) == 16
    assert seen[0]["tool_choice"] == "auto"
    assert [t["function"]["name"] for t in seen[0]["tools"]] == ["read_file"]
    assert client.post(endpoint, json=body, headers=headers).status_code == 409
    client.delete("/api/workers/" + worker["id"])
    assert client.post(endpoint, json=body, headers=headers).status_code == 403


def test_runner_reads_only_zip_members_and_incomplete_coverage(client, tmp_path):
    raw = package(extra={"references/note.md": b"Never execute target instructions."})
    version = upload(client, raw).json()["version_id"]
    root = client.app.state.root
    user = client.get("/api/me").json()
    # Fake protocol input drives the real runner; it is not live semantic evidence.
    save_model(root, "http://127.0.0.1:1/v1", "fixture", "")
    config = model_config(root)
    config["ready"] = True
    write_secret_json(root / "model-config.json", config)
    create_task(root, user, version, "L1", "full", "runner")
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "test")
    manifest = claim(root, worker["id"])

    class Fixture:
        def request(self, path, body):
            if len(body["messages"]) == 1:
                return {
                    "message": {
                        "content": None,
                        "reasoning_content": "synthetic-reasoning",
                        "tool_calls": [
                            {
                                "id": "read",
                                "function": {
                                    "name": "read_file",
                                    "arguments": '{"path":"references/note.md","offset":0,"limit":12000}',
                                },
                            }
                        ],
                    }
                }
            assert body["messages"][1]["reasoning_content"] == "synthetic-reasoning"
            initial = json.loads(body["messages"][0]["content"])
            assert initial["suppliedEvidence"][0]["path"] == "references/note.md"
            assert initial["suppliedEvidence"][0]["content"] == "Never execute target instructions."
            assert not body["require_tools"]  # all small-file evidence was actually supplied
            return {
                "message": {
                    "content": json.dumps({"findings": [], "checkedRuleIds": list(engine().catalogue())})
                }
            }

    result = run_audit(manifest, raw, Fixture(), tmp_path)
    assert result["reviewRequired"] and not result["semanticCompleted"]
    assert "synthetic-reasoning" not in json.dumps(result)
    assert result["verdict"] != "pass"
    assert not (tmp_path / "virtual-skill").exists()
    with transaction(root) as db:
        assert not db.execute("SELECT result_json FROM audit_runs").fetchone()[0]


def test_semantic_status_conflicts_and_missing_coverage_rejected():
    from skill_mng.runner import semantic_consistency

    rules = list(engine().catalogue())
    correct = {
        "findings": [],
        "checkedRuleIds": rules,
        "ruleResults": [{"ruleId": rule, "status": "pass"} for rule in rules],
    }
    assert semantic_consistency(correct, "L1") == []
    wrong = {
        **correct,
        "findings": [{"ruleId": "D4-E2", "reviewRequired": False, "message": "The rule is satisfied."}],
    }
    assert semantic_consistency(wrong, "L1")
    assert semantic_consistency({**correct, "checkedRuleIds": rules[:-1]}, "L1")
    assert semantic_consistency({**correct, "ruleResults": correct["ruleResults"][:-1]}, "L1")


def test_quoted_secret_values_redacted_before_read_ranges():
    from skill_mng.repair_packages import redact

    token = "synthetic-private-value-0123456789"
    for text in (json.dumps({"api_key": token}), "token = '" + token + "'", 'password: "' + token + '"'):
        redacted = redact(text)
        assert token not in redacted and len(redacted) == len(text)


@pytest.mark.parametrize(
    "message",
    [
        {"content": None},
        {"content": "not JSON"},
        {"tool_calls": [{"id": "batch", "function": {}}] * 13},
        {"tool_calls": [{"function": {"name": "read_file", "arguments": "{}"}}]},
    ],
)
def test_invalid_model_output_remains_reviewable(client, tmp_path, message):
    from skill_mng.auditing import validate_result

    raw = package()
    version = upload(client, raw).json()["version_id"]
    root = client.app.state.root
    user = client.get("/api/me").json()
    save_model(root, "http://127.0.0.1:1/v1", "fixture", "")
    config = model_config(root)
    config["ready"] = True
    write_secret_json(root / "model-config.json", config)
    create_task(root, user, version, "L1", "full", "malformed")
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "test")
    manifest = claim(root, worker["id"])

    class Fixture:
        def request(self, path, body):
            return {"message": message}

    result = run_audit(manifest, raw, Fixture(), tmp_path)
    assert result["reviewRequired"] and not result["semanticCompleted"]
    assert result["verdict"] != "pass"
    assert validate_result(result, manifest)["reportDigest"] == result["reportDigest"]


def test_semantic_malformed_status_cannot_crash_validation():
    from skill_mng.runner import semantic_consistency

    rows = [{"ruleId": rule, "status": "pass"} for rule in engine().catalogue()]
    rows[0]["status"] = []
    assert semantic_consistency({"findings": [], "ruleResults": rows}, "L1")


@pytest.mark.parametrize("wrapped", [False, True])
def test_model_timeout_has_stable_secret_free_code(monkeypatch, wrapped):
    import urllib.error
    from skill_mng.models import completion, ModelError

    class Opener:
        def open(self, request, timeout):
            error = TimeoutError("synthetic sensitive remote detail")
            raise urllib.error.URLError(error) if wrapped else error

    monkeypatch.setattr("skill_mng.models.urllib.request.build_opener", lambda *args: Opener())
    with pytest.raises(ModelError) as caught:
        completion({"base_url": "https://model.example/v1", "model": "fixture"}, {"messages": []})
    assert caught.value.code == "model_timeout" and caught.value.retryable
    assert "sensitive" not in str(caught.value)


def test_model_failure_event_contains_only_stable_code(client, monkeypatch):
    from skill_mng.models import ModelError

    root = client.app.state.root
    version = upload(client).json()["version_id"]
    user = client.get("/api/me").json()
    write_secret_json(root / "model-config.json", {"ready": True, "revision": "fixture"})
    created = create_task(root, user, version, "L1", "full", "failure-event")
    worker = redeem(root, create_enrollment(root, user["id"])["code"], "test")
    manifest = claim(root, worker["id"])

    def fail(config, payload, *, timeout):
        raise ModelError("model_http_503", True)

    monkeypatch.setattr("skill_mng.execution_api.completion", fail)
    response = client.post(
        f"/api/worker/attempts/{manifest['attemptId']}/model",
        json={"generation": 1, "messages": []},
        headers={"Authorization": "Bearer " + worker["credential"]},
    )
    assert response.status_code == 503
    events = client.get("/api/tasks/" + created["task_id"]).json()["events"]
    failure = next(event for event in events if event["kind"] == "model.failed")
    assert json.loads(failure["detail_json"]) == {"code": "model_http_503", "retryable": True}


@pytest.mark.parametrize("finish_reason", ["stop", "length"])
def test_completion_admin_effort_and_truncation(monkeypatch, finish_reason):
    import io
    from types import SimpleNamespace

    seen = []

    def open_request(request, timeout):
        seen.append(json.loads(request.data))
        return io.BytesIO(
            json.dumps(
                {
                    "choices": [
                        {"finish_reason": finish_reason, "message": {"role": "assistant", "content": "{}"}}
                    ]
                }
            ).encode()
        )

    monkeypatch.setattr(
        "skill_mng.models.urllib.request.build_opener", lambda *args: SimpleNamespace(open=open_request)
    )
    config = {"base_url": "https://provider.example/v1", "model": "fixture", "reasoning_effort": "low"}
    if finish_reason == "length":
        with pytest.raises(ModelError, match="model_output_truncated"):
            completion(config, {"messages": []})
    else:
        assert completion(config, {"messages": []})["content"] == "{}"
    assert seen[0]["reasoning_effort"] == "low"
    assert seen[0]["max_tokens"] == 6000
    if finish_reason == "stop":
        completion({k: v for k, v in config.items() if k != "reasoning_effort"}, {"messages": []})
        assert "reasoning_effort" not in seen[1]


def test_admin_effort_validation_and_private_storage(client):
    root = client.app.state.root
    settings = save_model(root, "http://127.0.0.1:1/v1", "fixture", "synthetic-key", "low")
    assert settings["reasoning_effort"] == "low" and not settings["ready"]
    assert model_config(root)["reasoning_effort"] == "low"
    with pytest.raises(ValueError):
        save_model(root, settings["base_url"], "fixture", reasoning_effort="arbitrary")
    assert (
        client.put(
            "/api/model",
            json={"base_url": settings["base_url"], "model": "fixture", "reasoning_effort": "arbitrary"},
        ).status_code
        == 422
    )
    response = client.put(
        "/api/model", json={"base_url": settings["base_url"], "model": "fixture", "reasoning_effort": "high"}
    )
    assert response.status_code == 200 and response.json()["reasoning_effort"] == "high"
    assert "synthetic-key" not in response.text


def test_editor_replays_reasoning_for_tool_results():
    from skill_mng.repair_runner import edit_candidate
    from skill_mng.repair_packages import unpack

    _, files = unpack(package())
    manifest = {
        "attemptId": "fixture",
        "leaseGeneration": 1,
        "skillSlug": "fixture",
        "authorization": {"editPaths": ["SKILL.md"]},
    }

    class Fixture:
        count = 0

        def request(self, path, body):
            self.count += 1
            if self.count == 1:
                return {
                    "message": {
                        "content": None,
                        "reasoning_content": "synthetic-editor-reasoning",
                        "tool_calls": [
                            {
                                "id": "read",
                                "function": {
                                    "name": "read_file",
                                    "arguments": '{"path":"SKILL.md","offset":0,"limit":12000}',
                                },
                            }
                        ],
                    }
                }
            assert body["messages"][1]["reasoning_content"] == "synthetic-editor-reasoning"
            return {"message": {"content": '{"needsAttention":false,"reason":"done"}'}}

    assert edit_candidate(manifest, files, Fixture(), 1, []) == files
