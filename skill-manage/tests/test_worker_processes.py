"""Real server/worker subprocesses with a clearly synthetic blocking model transport."""

import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from conftest import upload
from skill_mng.config import write_config, write_secret_json
from skill_mng.lifecycle import start, stop
from skill_mng.models import model_config, save_model
from skill_mng.worker import launch


def test_real_worker_restart_active_attempt_then_cancel(client):
    # This fixture verifies process/lease behavior only; it is not a semantic audit.
    calls = []
    release = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers["Content-Length"]))
            calls.append(time.monotonic())
            release.wait(30)
            try:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"choices":[{"message":{"role":"assistant","content":"{}"}}]}')
            except OSError:
                pass

        def log_message(self, *_):
            pass

    model = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=model.serve_forever, daemon=True)
    thread.start()
    root = client.app.state.root
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    write_config(root, {"host": "127.0.0.1", "port": port})
    save_model(root, f"http://127.0.0.1:{model.server_port}/v1", "blocking-fixture", "")
    settings = model_config(root)
    settings["ready"] = True
    write_secret_json(root / "model-config.json", settings)

    def until(predicate, seconds=15):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.2)
        raise AssertionError("process state did not converge")

    try:
        start(root)
        launch(root)
        version = upload(client).json()["version_id"]
        task = client.post(
            "/api/audits",
            json={"version_id": version, "mode": "full", "depth": "L1", "idempotency_key": "blocking"},
        ).json()
        until(lambda: len(calls) == 1)
        before = client.get("/api/tasks/" + task["task_id"]).json()
        assert before["state"] == "running" and len(before["attempts"]) == 1
        stop(root, "worker")
        launch(root)
        until(lambda: len(calls) == 2)
        after = client.get("/api/tasks/" + task["task_id"]).json()
        assert len(after["attempts"]) == 1  # same unexpired attempt recovered after process restart
        assert client.post("/api/tasks/" + task["task_id"] + "/cancel").status_code == 200
        until(lambda: client.get("/api/tasks/" + task["task_id"]).json()["state"] == "cancelled")
        assert client.get("/api/audits/" + task["audit_run_id"]).json()["result"] is None
    finally:
        release.set()
        stop(root, "worker")
        stop(root)
        model.shutdown()
        model.server_close()
        thread.join()
