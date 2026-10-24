"""Artifact correspondence, runtime-data exclusion and CI privilege boundaries."""

import io
import json
import tarfile
import zipfile
from pathlib import Path

import pytest
import yaml

from skill_mng.distribution import source_files, validate_member, verify


@pytest.fixture
def artifacts(tmp_path):
    root = tmp_path / "project"
    entries = {
        "pyproject.toml": '[project]\nname="open-skill-mng"\nversion="1.0.0"\n',
        "src/skill_mng/__init__.py": '__version__ = "1.0.0"\n',
        "src/skill_mng/resources/skills/skill-deep-audit/LICENSE": "Synthetic MIT notice\n",
        "LICENSE": "Synthetic MIT notice\n",
        "regression/vendor/webapp-testing/LICENSE.txt": "Synthetic Apache-2.0 notice\n",
        "regression/vendor/WEBAPP-TESTING-SOURCE.json": "{}\n",
        "requirements.lock": "PyYAML==6.0.3\n",
    }
    for name, text in entries.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    hidden = root / ".local/model-config.json"
    hidden.parent.mkdir()
    hidden.write_text('{"api_key":"synthetic-runtime-canary"}')
    files = source_files(root)
    export = tmp_path / "runtime.txt"
    export.write_text("pyyaml==6.0.3\n")

    def build(*, wheel_changes=None, sdist_changes=None):
        wheel = tmp_path / "fixture.whl"
        source = tmp_path / "fixture.tar.gz"
        wheel_files = {
            name.removeprefix("src/"): raw for name, raw in files.items() if name.startswith("src/")
        }
        wheel_files["open_skill_mng-1.0.0.dist-info/METADATA"] = b"Name: open-skill-mng\nVersion: 1.0.0\n"
        wheel_files.update(wheel_changes or {})
        with zipfile.ZipFile(wheel, "w") as archive:
            for name, raw in wheel_files.items():
                archive.writestr(name, raw)
        with tarfile.open(source, "w:gz") as archive:
            for name, raw in {**files, **(sdist_changes or {})}.items():
                if raw is None:
                    continue
                info = tarfile.TarInfo("fixture-1.0.0/" + name)
                info.size = len(raw)
                archive.addfile(info, io.BytesIO(raw))
        return root, wheel, source, export

    return build


def test_correspondence_manifest_matches_sources_and_excludes_private_state(artifacts):
    result = verify(*artifacts())
    assert result["applicationFilesMatched"] == 2
    assert result["runtimeLockMatched"] and result["licensesPreserved"] and result["runtimeDataExcluded"]
    assert "synthetic-runtime-canary" not in json.dumps(result)
    assert not any(".local" in path for path in result["sourceFiles"])


@pytest.mark.parametrize("tamper", ["code", "root", "metadata", "license", "runtime", "source"])
def test_tampered_artifacts_are_rejected(artifacts, tamper):
    wheel, sdist = {}, {}
    if tamper == "code":
        wheel["skill_mng/__init__.py"] = b'__version__ = "different"\n'
    elif tamper == "root":
        wheel["unexpected.py"] = b"print('never execute')"
    elif tamper == "metadata":
        wheel["open_skill_mng-1.0.0.dist-info/METADATA"] = b"Name: open-skill-mng\nVersion: 0.0.1\n"
    elif tamper == "license":
        sdist["LICENSE"] = None
    elif tamper == "runtime":
        sdist[".local/model-config.json"] = b"synthetic-sensitive-state"
    else:
        sdist["src/skill_mng/__init__.py"] = b"changed"
    with pytest.raises(ValueError, match="distribution_"):
        verify(*artifacts(wheel_changes=wheel, sdist_changes=sdist))


@pytest.mark.parametrize(
    "name",
    [
        "/absolute",
        "../escape.py",
        "package/.env",
        "package/registry.db",
        "package/credentials.json",
        "package/cache.pyc",
    ],
)
def test_forbidden_archive_names(name):
    with pytest.raises(ValueError, match="distribution_"):
        validate_member(name)


def test_runtime_dependency_lock_cannot_drift(artifacts):
    root, wheel, sdist, export = artifacts()
    export.write_text("pyyaml==0.0.1\n")
    with pytest.raises(ValueError, match="runtime_lock_mismatch"):
        verify(root, wheel, sdist, export)


def test_ci_is_scoped_read_only_and_has_no_model_or_release_job():
    path = Path(__file__).resolve().parents[2] / ".github/workflows/skill-manage-checks.yml"
    if not path.exists():
        pytest.skip("Workflow belongs to monorepo checkout, outside standalone sdist")
    text = path.read_text()
    workflow = yaml.load(text, Loader=yaml.BaseLoader)
    assert workflow["permissions"] == {"contents": "read"}
    assert workflow["on"]["pull_request"]["paths"] == [
        "skill-manage/**",
        ".github/workflows/skill-manage-checks.yml",
    ]
    assert set(workflow["jobs"]) == {"checks"}
    job = workflow["jobs"]["checks"]
    assert job["strategy"]["matrix"]["python"] == ["3.11", "3.12", "3.13"]
    assert "--mode static" in text and "--mode full" not in text and "secrets." not in text
    for step in job["steps"]:
        if "uses" in step:
            assert len(step["uses"].split("@")[1]) == 40
    upload = job["steps"][-1]["with"]["path"]
    assert "skill-manage/.local/\n" not in upload
    assert "model-config" not in upload and "wheel-env" not in upload
