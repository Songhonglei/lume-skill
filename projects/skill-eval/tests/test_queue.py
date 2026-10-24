"""Protocol tests use synthetic receipts; these are not evidence of real model execution."""
import base64
import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from backend.storage import PackageFile, pack_zip

CAPABILITIES = {"skill_up_version": "0.14.0", "codex_version": "0.162.1", "login_configured": True,
                "connection_fingerprint": "a" * 64, "connection_label": "Synthetic protocol fixture"}


def worker(admin, name="synthetic-worker", capabilities=None):
    code = admin.post("/api/worker-enrollment-codes").json()["code"].split(".", 1)[1]
    secret = json.loads(base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)))["code"]
    payload = {"code": secret, "name": name, "capabilities": capabilities or CAPABILITIES}
    response = admin.post("/api/worker/enroll", json=payload)
    assert response.status_code == 200, response.text
    assert admin.post("/api/worker/enroll", json=payload).status_code == 401
    return response.json(), {"Authorization": "Bearer " + response.json()["token"]}


def resource(admin):
    package = {
        "SKILL.md": PackageFile(b"---\nname: queue-fixture\ndescription: synthetic fixture\n---\nReply OK."),
        "evals/eval.yaml": PackageFile(b"schema_version: v1alpha1\nenvironment: {type: none}\nengine: {name: codex}\ncases:\n  files: [evals/cases/one.yaml]\n"),
        "evals/cases/one.yaml": PackageFile(b"id: one\ntitle: Synthetic protocol case\ninput: {prompt: Reply OK}\njudge:\n  type: rule_based\n  success:\n    - output_contains: {all: [OK]}\n"),
    }
    uploaded = admin.post("/api/skills/import", files={"file": ("skill.zip", pack_zip(package))}).json()
    assert uploaded["imported_draft"]["validation"]["valid"], uploaded
    draft = uploaded["imported_draft"]
    saved = admin.post(f"/api/set-versions/{draft['id']}/save", json={"expected_edit_number": 1}).json()
    assert admin.post(f"/api/sets/{draft['set_id']}/activate", json={"version_id": saved["id"]}).status_code == 200
    return uploaded, saved


def task(admin, uploaded, key=None, **overrides):
    body = {"kind": "evaluate", "skill_version_id": uploaded["version"]["id"], **overrides}
    response = admin.post("/api/tasks", json=body, headers={"Idempotency-Key": key or str(uuid4())})
    assert response.status_code == 200, response.text
    return response.json()


def claim(admin, authorization, capabilities=None):
    response = admin.post("/api/worker/claim", json={"capabilities": capabilities or CAPABILITIES}, headers=authorization)
    assert response.status_code == 200, response.text
    return response.json()["job"]


def ready(admin):
    registered, authorization = worker(admin)
    assert admin.put("/api/settings/model", json={"worker_id": registered["worker_id"], "name": "synthetic-model"}).status_code == 200
    uploaded, saved = resource(admin)
    return registered, authorization, uploaded, saved


def receipt(job, *, missing=False):
    raw = {"engine_name": "codex", "observed_configuration": {"version": "0.162.1"},
           "requested_configuration": {"model": "synthetic-model"}, "case_results": [] if missing else [
               {"case_id": c["id"], "status": "PASS", "grading": {"status": "PASS", "assertion_results": [{"passed": True, "text": "fixture assertion"}]}}
               for c in job["input"]["cases"]]}
    bundle = pack_zip({"iteration-1/result.json": PackageFile(json.dumps(raw).encode()),
                       "iteration-1/report.html": PackageFile(b"<script>fetch('/api/settings')</script>synthetic report")})
    metadata = {"exit_code": 0, "source_digest_before": job["input"]["source_digest"],
                "source_digest_after": job["input"]["source_digest"]}
    return bundle, metadata


def complete(admin, authorization, job, bundle=None, metadata=None):
    if bundle is None:
        bundle, metadata = receipt(job)
    return admin.post(f"/api/worker/attempts/{job['attempt_id']}/complete",
                      files={"file": ("result.zip", bundle)}, data={"metadata": json.dumps(metadata)},
                      headers={**authorization, "X-Lease-Token": job["lease_token"]})


def test_double_click_and_two_workers_compete(admin):
    _, auth, uploaded, _ = ready(admin)
    _, second = worker(admin, "second-worker")
    key = str(uuid4())
    created = task(admin, uploaded, key)
    assert task(admin, uploaded, key)["id"] == created["id"]
    different = admin.post("/api/tasks", json={"kind": "generate", "skill_version_id": uploaded["version"]["id"]}, headers={"Idempotency-Key": key})
    assert different.status_code == 409
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = list(pool.map(lambda headers: claim(admin, headers), [auth, second]))
    assert sum(job is not None for job in jobs) == 1
    assert jobs[0] is None or claim(admin, auth) is None


def test_receipt_is_idempotent_and_report_is_sandboxed(admin):
    _, authorization, uploaded, _ = ready(admin)
    created = task(admin, uploaded)
    job = claim(admin, authorization)
    first = complete(admin, authorization, job)
    assert first.status_code == 200, first.text
    assert first.json()["summary"]["verdict"] == "PASSED"
    assert complete(admin, authorization, job).status_code == 200
    detail = admin.get(f"/api/tasks/{created['id']}").json()
    assert detail["state"] == "SUCCEEDED" and len(detail["artifacts"]) == 1
    report = admin.get(f"/api/artifacts/{detail['artifacts'][0]['id']}/report")
    assert "sandbox allow-scripts" in report.headers["Content-Security-Policy"]
    assert "connect-src 'none'" in report.headers["Content-Security-Policy"]
    bundle, metadata = receipt(job)
    metadata["exit_code"] = 1
    assert complete(admin, authorization, job, bundle, metadata).status_code == 409


def test_expired_attempt_never_overwrites_manual_retry(admin):
    _, authorization, uploaded, _ = ready(admin)
    created = task(admin, uploaded)
    original = claim(admin, authorization)
    with admin.app.state.database.connection() as connection:
        connection.execute("UPDATE attempts SET lease_until=now()-interval '1 second' WHERE id=%s", (original["attempt_id"],))
    assert admin.get(f"/api/tasks/{created['id']}").json()["state"] == "INTERRUPTED"
    assert claim(admin, authorization) is None
    retry_key = str(uuid4())
    assert admin.post(f"/api/tasks/{created['id']}/retry", headers={"Idempotency-Key": retry_key}).status_code == 200
    next_job = claim(admin, authorization)
    assert next_job["attempt_number"] == 2
    assert next_job["input"] == original["input"]
    assert complete(admin, authorization, original).status_code == 409
    detail = admin.get(f"/api/tasks/{created['id']}").json()
    assert detail["current_attempt_id"] == next_job["attempt_id"] and detail["state"] == "RUNNING"
    assert len(detail["attempts"]) == 2
    assert admin.post(f"/api/tasks/{created['id']}/retry", headers={"Idempotency-Key": retry_key}).status_code == 200


def test_cancel_wins_before_completion_and_revoke_stops_access(admin):
    registered, authorization, uploaded, _ = ready(admin)
    queued = task(admin, uploaded)
    assert admin.post(f"/api/tasks/{queued['id']}/cancel").json()["state"] == "CANCELLED"
    assert claim(admin, authorization) is None
    running = task(admin, uploaded)
    job = claim(admin, authorization)
    assert admin.post(f"/api/tasks/{running['id']}/cancel").json()["state"] == "CANCEL_REQUESTED"
    heartbeat = admin.post("/api/worker/heartbeat", json={"capabilities": CAPABILITIES, "attempt_id": job["attempt_id"], "lease_token": job["lease_token"]}, headers=authorization)
    assert heartbeat.json()["cancel"]
    assert complete(admin, authorization, job).status_code == 200
    final = admin.get(f"/api/tasks/{running['id']}").json()
    assert (final["state"], final["verdict"]) == ("CANCELLED", "INCOMPLETE")
    assert admin.post(f"/api/workers/{registered['worker_id']}/revoke").status_code == 200
    assert admin.post("/api/worker/claim", json={"capabilities": CAPABILITIES}, headers=authorization).status_code == 401
    assert complete(admin, authorization, job).status_code == 401


def test_missing_case_or_wrong_source_cannot_pass(admin):
    _, authorization, uploaded, _ = ready(admin)
    created = task(admin, uploaded)
    job = claim(admin, authorization)
    bundle, metadata = receipt(job, missing=True)
    assert complete(admin, authorization, job, bundle, metadata).json()["summary"]["verdict"] == "INCOMPLETE"
    assert admin.get(f"/api/tasks/{created['id']}").json()["state"] == "FAILED"


def test_worker_ownership_and_version_matching(admin):
    _, authorization, uploaded, _ = ready(admin)
    _, wrong_version = worker(admin, "old", {**CAPABILITIES, "codex_version": "0.1.0"})
    created = task(admin, uploaded)
    assert claim(admin, wrong_version, {**CAPABILITIES, "codex_version": "0.1.0"}) is None
    job = claim(admin, authorization)
    result = admin.get(f"/api/worker/attempts/{job['attempt_id']}/input/skill", headers={**wrong_version, "X-Lease-Token": job["lease_token"]})
    assert result.status_code == 404
    assert admin.get(f"/api/tasks/{created['id']}").json()["state"] == "RUNNING"


def test_reviewed_versions_and_contiguous_events(admin):
    _, authorization, uploaded, saved = ready(admin)
    model = admin.get('/api/settings').json()['model']
    base = {'kind': 'evaluate', 'skill_version_id': uploaded['version']['id']}
    for override in ({'expected_model_id': str(uuid4())}, {'expected_set_version_id': str(uuid4())}):
        assert admin.post('/api/tasks', json={**base, **override}, headers={'Idempotency-Key': str(uuid4())}).status_code == 409
    created = task(admin, uploaded, expected_model_id=model['id'], expected_set_version_id=saved['id'])
    job = claim(admin, authorization)
    endpoint = f"/api/worker/attempts/{job['attempt_id']}/events"
    headers = {**authorization, 'X-Lease-Token': job['lease_token']}
    assert admin.post(endpoint, headers=headers, json={'events': [{'sequence': 2, 'payload': {'message': 'gap'}}]}).status_code == 409
    body = {'events': [{'sequence': 1, 'payload': {'message': 'first'}}]}
    assert admin.post(endpoint, headers=headers, json=body).json()['accepted_sequence'] == 1
    assert admin.post(endpoint, headers=headers, json=body).json()['accepted_sequence'] == 1
    assert len(admin.get(f"/api/tasks/{created['id']}/events").json()) == 1


def test_history_pagination_and_server_side_search(admin):
    _, _, uploaded, _ = ready(admin)
    first = task(admin, uploaded)
    second = task(admin, uploaded)
    page_one = admin.get('/api/tasks?limit=1').json()
    page_two = admin.get('/api/tasks?limit=1&offset=1').json()
    assert page_one[0]['id'] == second['id']
    assert page_two[0]['id'] == first['id']
    assert len(admin.get('/api/tasks?query=queue-fixture&kind=evaluate').json()) == 2
    assert admin.get('/api/tasks?kind=generate').json() == []
    assert admin.get('/api/tasks?query=not-a-synthetic-skill').json() == []
    assert admin.get('/api/tasks?offset=-1').status_code == 422
