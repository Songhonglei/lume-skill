import json
import subprocess
from pathlib import Path


def test_installed_environment_runs_its_python_and_pip(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "deploy"))
    from install_worker import create_environment

    target = tmp_path / "app with spaces" / "venv"
    create_environment(target)
    command = [str(target / "bin/python3"), "-c",
               "import json,pip,sys; print(json.dumps({'prefix':sys.prefix,'pip':pip.__file__}))"]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    installed = json.loads(result.stdout)
    assert Path(installed["prefix"]) == target
    assert Path(installed["pip"]).is_relative_to(target)
