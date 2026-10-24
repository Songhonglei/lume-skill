"""A model-only subprocess guardian survives a Worker crash and enforces its lease deadline."""
import json
import os
import signal
import sys
import time
from pathlib import Path

from worker.engine import EngineError, run_process


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def lease_lost():
        if stopped:
            return True
        try:
            lease = json.loads(Path(spec["lease_file"]).read_text())
            return time.monotonic() >= lease["deadline"]
        except (ValueError, OSError, KeyError):
            return True

    result = {"exit_code": None, "error": ""}
    try:
        child_env = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
        result["exit_code"] = run_process(spec["args"], Path(spec["cwd"]), child_env,
                                           Path(spec["log"]), spec["timeout"], lease_lost)
    except EngineError as error:
        result["error"] = str(error)
    Path(spec["result"]).write_text(json.dumps(result))


if __name__ == "__main__":
    main()
