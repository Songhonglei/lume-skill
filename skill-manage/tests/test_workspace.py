"""Version-bound presentation data, bounded queries and exact filtered totals."""

import json

from conftest import PASSWORD, login, package, upload
from skill_mng.db import transaction
from skill_mng.tasks import create_task
from skill_mng.workspace import skill_list


def frozen_summary(root, user, version, key, *, mode="full", verdict="pass", score=117):
    task = create_task(root, user, version, "L1", mode, key)
    # A small synthetic persisted result exercises the read model, not model semantics.
    result = {
        "score": score,
        "maxScore": 117,
        "errorCount": int(verdict == "fail"),
        "warningCount": 0,
        "reviewRequired": verdict == "review_required",
        "reportMarkdown": "synthetic-report-body-not-in-summary",
    }
    with transaction(root, write=True) as db:
        db.execute("UPDATE tasks SET state='succeeded' WHERE id=?", (task["task_id"],))
        db.execute(
            "UPDATE audit_runs SET verdict=?,delivery_status='saved',result_json=? WHERE id=?",
            (verdict, json.dumps(result), task["audit_run_id"]),
        )
    return task


def test_skill_summary_uses_current_version_and_latest_run_without_report_bodies(client):
    root, user = client.app.state.root, client.get("/api/me").json()
    original = upload(client).json()
    other = upload(client, package(version="2.0.0")).json()
    first = frozen_summary(root, user, original["version_id"], "first")
    frozen_summary(root, user, other["version_id"], "newer-version", verdict="fail", score=110)
    row = client.get("/api/skills").json()[0]
    assert row["latest_audit"]["id"] == first["audit_run_id"]
    assert row["latest_audit"]["version_id"] == original["version_id"]
    latest = frozen_summary(
        root, user, original["version_id"], "static-latest", mode="static", verdict="review_required"
    )
    row = client.get("/api/skills").json()[0]
    assert row["latest_audit"]["id"] == latest["audit_run_id"]
    assert row["latest_audit"]["mode"] == "static"
    assert row["latest_audit"]["review_required"]
    assert row["can_write"] and row["version_count"] == 2
    assert "synthetic-report-body" not in json.dumps(row)
    report = client.get("/api/audits/" + latest["audit_run_id"]).json()
    assert report["skill_id"] == original["skill_id"]
    assert report["registered_version"] == "1.0.0" and report["mode"] == "static"
    detail = client.get("/api/skills/" + original["skill_id"]).json()
    versions = {v["id"]: v for v in detail["versions"]}
    assert versions[other["version_id"]]["latest_audit"]["verdict"] == "fail"
    assert versions[original["version_id"]]["latest_audit"]["mode"] == "static"
    assert (
        client.put(
            "/api/skills/" + original["skill_id"] + "/current", json={"version_id": other["version_id"]}
        ).status_code
        == 200
    )
    assert client.get("/api/skills").json()[0]["latest_audit"]["version_id"] == other["version_id"]


def test_skill_list_query_count_does_not_grow_with_skills(client):
    root, user = client.app.state.root, client.get("/api/me").json()
    for index in range(12):
        item = upload(client, package(name=f"workspace-{index}")).json()
        create_task(root, user, item["version_id"], "L1", "static", f"q-{index}")
    with transaction(root) as db:
        queries = []
        db.set_trace_callback(queries.append)
        rows = skill_list(db, user)
        db.set_trace_callback(None)
    assert len(rows) == 12
    assert len(queries) == 2
    assert all(row["latest_audit"]["mode"] == "static" for row in rows)


def test_task_summary_counts_full_filtered_snapshot_and_binds_version_cursor(client):
    root, user = client.app.state.root, client.get("/api/me").json()
    first = upload(client).json()
    second = upload(client, package(version="2.0.0")).json()
    for index in range(5):
        frozen_summary(root, user, first["version_id"], f"filtered-{index}", verdict="fail")
    frozen_summary(root, user, second["version_id"], "other-version")
    query = {"version_id": first["version_id"], "limit": 2}
    page = client.get("/api/task-history", params=query).json()
    assert page["summary"] == {"total": 5, "active": 0, "attention": 5}
    assert len(page["items"]) == 2 and page["hasMore"]
    assert page["items"][0]["audit_mode"] == "full"
    assert page["items"][0]["error_count"] == 1
    assert "synthetic-report-body" not in json.dumps(page)
    frozen_summary(root, user, first["version_id"], "after-snapshot")
    next_page = client.get("/api/task-history", params={**query, "cursor": page["nextCursor"]}).json()
    assert next_page["summary"] == page["summary"]
    assert (
        client.get(
            "/api/task-history",
            params={**query, "version_id": second["version_id"], "cursor": page["nextCursor"]},
        ).status_code
        == 400
    )
    assert client.get("/api/task-history", params={"version_id": "missing"}).json()["summary"]["total"] == 0


def test_workspace_summaries_keep_read_visibility_and_write_permissions_separate(client):
    upload(client)
    client.post("/api/users", json={"username": "workspace-reader", "password": PASSWORD})
    login(client, "workspace-reader")
    row = client.get("/api/skills").json()[0]
    assert not row["can_write"] and row["latest_audit"] is None
    assert client.get("/api/skills/" + row["id"]).json()["can_write"] is False
    assert client.get("/api/task-history").status_code == 200
    client.post("/api/logout", json={})
    assert client.get("/api/skills").status_code == 401
    assert client.get("/api/task-history").status_code == 401
