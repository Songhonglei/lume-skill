import pytest

from worker.client import ProtocolError
from worker.runtime import Worker


@pytest.mark.parametrize("status", [401, 403])
def test_revoked_or_forbidden_worker_does_not_exit_successfully(tmp_path, monkeypatch, status):
    class Center:
        calls = 0

        def heartbeat(self, capabilities):
            self.calls += 1
            raise ProtocolError(status, "Worker access rejected")

    center = Center()
    worker = Worker(center, tmp_path, tmp_path / "skill-up", tmp_path / "profile", tmp_path / "assets")
    monkeypatch.setattr(worker, "capabilities", lambda: {})
    with pytest.raises(ProtocolError) as caught:
        worker.run(once=True)
    assert caught.value.status == status
    assert center.calls == 1
