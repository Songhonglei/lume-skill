"""Real SQLite/API history traversal, filters, snapshots and permission boundaries."""

import json

import pytest

from conftest import PASSWORD, login, upload
from skill_mng.db import transaction
from skill_mng.registry import record_event
from skill_mng.tasks import create_enrollment, create_task


def seed_tasks(client, count=235):
    root = client.app.state.root
    user = client.get("/api/me").json()
    version = upload(client).json()["version_id"]
    tasks = [create_task(root, user, version, "L1", "static", f"history-{i}") for i in range(count)]
    with transaction(root, write=True) as db:
        db.execute("UPDATE tasks SET created_at='2026-10-25T00:00:00+00:00'")
        for i, task in enumerate(tasks):
            if i % 3 == 0:
                db.execute("UPDATE tasks SET state='failed' WHERE id=?", (task["task_id"],))
    return root, user, version, tasks


def collect(client, path, first=None):
    page = first or client.get(path).json()
    rows = list(page["items"])
    while page["nextCursor"]:
        separator = "&" if "?" in path else "?"
        response = client.get(path + separator + "cursor=" + page["nextCursor"])
        assert response.status_code == 200, response.text
        page = response.json()
        rows.extend(page["items"])
    assert not page["hasMore"]
    return rows


def test_task_keyset_covers_more_than_200_tied_rows_and_excludes_new_inserts(client):
    root, user, version, tasks = seed_tasks(client)
    path = "/api/task-history?limit=37"
    first = client.get(path).json()
    assert first["hasMore"] and len(first["items"]) == 37
    new = create_task(root, user, version, "L1", "static", "new-after-snapshot")
    rows = collect(client, path, first)
    assert [r["id"] for r in rows] == [r["task_id"] for r in reversed(tasks)]
    assert len({r["id"] for r in rows}) == 235
    assert new["task_id"] == client.get(path).json()["items"][0]["id"]
    legacy = client.get("/api/tasks").json()
    assert isinstance(legacy, list) and len(legacy) == 200
    assert client.get("/api/task-history", params={"state": "failed"}).json()["items"]
    assert all(r["state"] == "failed" for r in collect(client, "/api/task-history?state=failed&limit=100"))
    assert client.get("/api/task-history?kind=repair").json()["items"] == []
    skill_id = first["items"][0]["skill_id"]
    assert len(collect(client, "/api/task-history?skill_id=" + skill_id + "&limit=100")) == 236
    assert client.get("/api/task-history?skill_id=missing").json()["items"] == []
    assert client.get("/api/task-history?q=" + new["task_id"]).json()["items"][0]["id"] == new["task_id"]
    with transaction(root, write=True) as db:
        db.execute("UPDATE skills SET name=? WHERE id=?", ("Review 100%_safe", skill_id))
    assert len(collect(client, "/api/task-history?q=100%25_&limit=100")) == 236
    assert client.get("/api/task-history?q=100X").json()["items"] == []
    assert client.get("/api/task-history?state=failed&cursor=" + first["nextCursor"]).status_code == 400


@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=101",
        "state=unknown",
        "kind=other",
        "cursor=!!",
        "cursor=e30",
        "cursor=" + "x" * 1025,
    ],
)
def test_history_rejects_invalid_bounds_and_cursor(client, query):
    assert client.get("/api/task-history?" + query).status_code in (400, 422)


def test_events_cover_old_limit_keep_subject_scope_and_expose_latest_error(client):
    root, user, version, tasks = seed_tasks(client, 2)
    task_id = tasks[0]["task_id"]
    with transaction(root, write=True) as db:
        for i in range(235):
            subject = task_id if i % 2 else tasks[0]["audit_run_id"]
            record_event(db, user["id"], "history.test", subject, {"index": i})
        record_event(db, user["id"], "model.failed", task_id, {"code": "model_timeout", "retryable": True})
        expected = [
            r[0]
            for r in db.execute(
                "SELECT id FROM events WHERE subject_id IN (?,?) ORDER BY id",
                (task_id, tasks[0]["audit_run_id"]),
            )
        ]
    path = "/api/tasks/" + task_id + "/events?limit=41"
    first = client.get(path).json()
    with transaction(root, write=True) as db:
        record_event(db, user["id"], "history.new", task_id)
    rows = collect(client, path, first)
    assert [r["id"] for r in rows] == expected
    assert len(rows) > 200
    assert (
        client.get("/api/tasks/" + tasks[1]["task_id"] + "/events?cursor=" + first["nextCursor"]).status_code
        == 400
    )
    detail = client.get("/api/tasks/" + task_id).json()
    assert len(detail["events"]) == 200
    assert json.loads(detail["latest_model_error"]["detail_json"])["code"] == "model_timeout"
    assert client.get("/api/tasks/missing/events").status_code == 404


def test_enrollment_pagination_hides_credentials_and_preserves_roles(client):
    root, user, version, tasks = seed_tasks(client, 2)
    codes = [create_enrollment(root, user["id"]) for _ in range(120)]
    first = client.get("/api/worker-enrollment-history?limit=17").json()
    create_enrollment(root, user["id"])
    rows = collect(client, "/api/worker-enrollment-history?limit=17", first)
    assert [r["id"] for r in rows] == [c["id"] for c in reversed(codes)]
    assert "code_hash" not in json.dumps(rows)
    assert all(c["code"] not in json.dumps(rows) for c in codes)
    assert (
        client.post(
            "/api/users", json={"username": "reader", "password": PASSWORD, "role": "maintainer"}
        ).status_code
        == 201
    )
    task_cursor = client.get("/api/task-history?limit=1").json()["nextCursor"]
    login(client, "reader")
    assert client.get("/api/task-history?cursor=" + task_cursor).status_code == 400
    assert client.get("/api/worker-enrollment-history").status_code == 403
    assert client.get("/api/task-history").status_code == 200
    assert client.get("/api/tasks/" + tasks[0]["task_id"] + "/events").status_code == 200
    assert client.post("/api/tasks/" + tasks[0]["task_id"] + "/cancel", json={}).status_code == 403
    client.post("/api/logout", json={})
    assert client.get("/api/task-history").status_code == 401
    assert client.get("/api/tasks/" + tasks[0]["task_id"] + "/events").status_code == 401
