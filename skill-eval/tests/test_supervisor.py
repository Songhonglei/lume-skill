import os
import subprocess
import sys
import time

import pytest

from worker.client import save_json
from worker.engine import EngineError, run_process


def alive(pid):
    result = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True, check=False)
    return result.returncode == 0 and bool(result.stdout.strip()) and not result.stdout.strip().startswith("Z")


def test_lease_guard_stops_children_in_other_process_groups(tmp_path):
    lease = tmp_path / "lease.json"
    save_json(lease, {"deadline": time.monotonic() + 1})
    pidfile = tmp_path / "pid"
    script = ("import subprocess,time; p=subprocess.Popen(['sleep','90'],start_new_session=True);"
              f"open({str(pidfile)!r},'w').write(str(p.pid));time.sleep(90)")
    with pytest.raises(EngineError, match="lease lost"):
        run_process([sys.executable, "-c", script], tmp_path, {"PATH": os.environ["PATH"]},
                    tmp_path / "run.log", 5, lease_file=lease)
    assert not alive(int(pidfile.read_text()))


def test_guardian_survives_worker_crash_and_does_not_rerun(tmp_path):
    lease = tmp_path / "lease.json"
    save_json(lease, {"deadline": time.monotonic() + 1.5})
    pidfile = tmp_path / "pid"
    marker = tmp_path / "starts"
    child = f"import os,time;open({str(pidfile)!r},'w').write(str(os.getpid()));open({str(marker)!r},'a').write('start\\n');time.sleep(90)"
    outer = ("from pathlib import Path;from worker.engine import run_process;import os,sys;"
             f"run_process([sys.executable,'-c',{child!r}],Path({str(tmp_path)!r}),{{'PATH':os.environ['PATH']}},"
             f"Path({str(tmp_path / 'run.log')!r}),10,lease_file=Path({str(lease)!r}))")
    process = subprocess.Popen([sys.executable, "-c", outer], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if pidfile.exists():
                break
            time.sleep(0.03)
        assert pidfile.exists()
        process.kill()
        process.wait(timeout=2)
        pid = int(pidfile.read_text())
        for _ in range(100):
            if not alive(pid):
                break
            time.sleep(0.05)
        assert not alive(pid)
        assert marker.read_text() == "start\n"
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
