"""Check fresh Compose setup and persisted builtin enrollment without a model call."""
import argparse
import json
import os
import secrets
import time
from pathlib import Path

import httpx


def check(url: str, state_file: Path, verify: bool, timeout: int) -> None:
    state = json.loads(state_file.read_text()) if verify else {}
    if verify and state.get("url") != url:
        raise SystemExit("Verification URL must match the saved deployment")
    deadline = time.monotonic() + timeout
    with httpx.Client(base_url=url, headers={"Origin": url}, cookies=state.get("cookies", {}), timeout=5) as client:
        while True:
            try:
                response = client.get("/api/health")
                response.raise_for_status()
                break
            except httpx.HTTPError:
                if time.monotonic() >= deadline:
                    raise SystemExit("Center did not become healthy within the timeout") from None
                time.sleep(2)
        if verify:
            response = client.get("/api/session")
            response.raise_for_status()
            if not response.json().get("authenticated"):
                raise SystemExit("Original session was not retained")
        else:
            if state_file.exists():
                raise SystemExit("State file already exists; use a fresh deployment or --verify")
            response = client.get("/api/setup")
            response.raise_for_status()
            if response.json()["initialized"]:
                raise SystemExit("Fresh setup check requires an uninitialized database")
            response = client.post("/api/setup", json={"password": secrets.token_urlsafe(32)})
            response.raise_for_status()
            state["cookies"] = dict(client.cookies)
            state["csrf_token"] = response.json()["csrf_token"]
            state["url"] = url
        while True:
            response = client.get("/api/workers")
            response.raise_for_status()
            workers = response.json()
            if len(workers) == 1 and workers[0]["online"]:
                break
            if time.monotonic() >= deadline:
                raise SystemExit("Expected exactly one online builtin Worker")
            time.sleep(2)
        worker = workers[0]
        if not worker["builtin"] or worker["revoked"]:
            raise SystemExit("Worker must be an active builtin enrollment")
        capabilities = worker["capabilities"]
        if capabilities.get("skill_up_version") != "0.14.0" or capabilities.get("codex_version") != "0.162.1":
            raise SystemExit("Container CLI versions do not match the pinned toolchain")
        if verify:
            if worker["id"] != state["worker_id"]:
                raise SystemExit("Builtin Worker identity changed after restart")
        else:
            state["worker_id"] = worker["id"]
            state_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with os.fdopen(os.open(state_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as stream:
                json.dump(state, stream)
        print("PASS: " + ("session and single builtin Worker retained" if verify else "fresh setup and builtin enrollment"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--state", required=True, type=Path, help="Private receipt; do not upload or commit")
    parser.add_argument("--verify", action="store_true", help="Verify persisted state after a restart")
    parser.add_argument("--timeout", type=int, default=180)
    options = parser.parse_args()
    if not 10 <= options.timeout <= 1800:
        parser.error("--timeout must be between 10 and 1800 seconds")
    check(options.url.rstrip("/"), options.state, options.verify, options.timeout)
