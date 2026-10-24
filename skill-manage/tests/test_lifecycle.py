import json
import os
import socket

import pytest

from skill_mng.config import write_config
from skill_mng.db import migrate
from skill_mng.lifecycle import process_record, start


def test_process_identity_prevents_unrelated_kill(tmp_path):
    migrate(tmp_path)
    (tmp_path / "run/server.json").write_text(
        json.dumps({"pid": os.getpid(), "instance": "a" * 48, "data_dir": str(tmp_path)})
    )
    with pytest.raises(RuntimeError, match="拒绝发送信号"):
        process_record(tmp_path)
    # The test runner is still alive; a record alone cannot authorize signalling it.
    os.kill(os.getpid(), 0)


def test_busy_port_does_not_spawn_server(tmp_path):
    migrate(tmp_path)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        write_config(tmp_path, {"host": "127.0.0.1", "port": listener.getsockname()[1]})
        with pytest.raises(RuntimeError, match="端口"):
            start(tmp_path)
    assert not (tmp_path / "run/server.json").exists()
