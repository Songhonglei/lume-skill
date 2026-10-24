"""Read-only source/wheel/sdist correspondence and portable artifact manifest."""

import argparse
import ast
import email.parser
import json
import re
import stat
import subprocess
import tarfile
import tomllib
import zipfile
from pathlib import Path, PurePosixPath

from .regression_corpus import digest

ROOT_FILES = {
    "README.md",
    "LICENSE",
    "pyproject.toml",
    "uv.lock",
    "requirements.lock",
    "Dockerfile",
    "compose.yaml",
    ".gitignore",
    ".gitattributes",
    ".dockerignore",
}
SOURCE_DIRS = {"src", "tests", "docs", "examples", "regression", "tools"}
EXCLUDED = {".local", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache", ".git", "dist", "build", "data"}


def source_files(root):
    files = {}
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        parts = relative.parts
        if set(parts) & EXCLUDED or path.suffix in {".pyc", ".pyo"}:
            continue
        if parts[0] not in SOURCE_DIRS and relative.as_posix() not in ROOT_FILES:
            continue
        if path.is_symlink():
            raise ValueError("distribution_source_symlink")
        if path.is_file():
            files[relative.as_posix()] = path.read_bytes()
    return files


def validate_member(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name or set(path.parts) & EXCLUDED:
        raise ValueError("distribution_unsafe_member")
    if any(part.startswith(".env") and part != ".env.example" for part in path.parts):
        raise ValueError("distribution_environment_file")
    if path.name in {"model-config.json", "credentials.json", "setup-code", "registry.db"} or name.endswith(
        (".db", ".log", ".pyc", ".pyo")
    ):
        raise ValueError("distribution_runtime_data")


def requirements(raw):
    result = set()
    for line in raw.decode().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if not re.fullmatch(r"[A-Za-z0-9_.-]+==[^\s]+(?:\s*;.*)?", line):
            raise ValueError("distribution_unpinned_requirement")
        name, version = line.split("==", 1)
        result.add(re.sub(r"[-_.]+", "-", name).lower() + "==" + version)
    return result


def verify(root, wheel, sdist, runtime_requirements=None):
    files = source_files(root)
    project = tomllib.loads(files["pyproject.toml"].decode())["project"]
    version = project["version"]
    tree = ast.parse(files["src/skill_mng/__init__.py"])
    declared = [
        node.value.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "__version__" for t in node.targets)
        and isinstance(node.value, ast.Constant)
    ]
    if declared != [version]:
        raise ValueError("distribution_source_version_mismatch")
    app = {p.removeprefix("src/"): raw for p, raw in files.items() if p.startswith("src/skill_mng/")}
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or len(names) > 10000:
            raise ValueError("distribution_duplicate_or_excess_members")
        for name in names:
            validate_member(name)
            if not (
                name.startswith("skill_mng/")
                or name.startswith(project["name"].replace("-", "_") + "-" + version + ".dist-info/")
            ):
                raise ValueError("distribution_unexpected_wheel_root")
        if sum(info.file_size for info in archive.infolist()) > 128 * 1024 * 1024 or any(
            info.file_size > 16 * 1024 * 1024 or stat.S_ISLNK(info.external_attr >> 16)
            for info in archive.infolist()
        ):
            raise ValueError("distribution_wheel_member_invalid")
        actual = {name for name in names if name.startswith("skill_mng/") and not name.endswith("/")}
        if actual != set(app) or any(archive.read(name) != raw for name, raw in app.items()):
            raise ValueError("distribution_wheel_source_mismatch")
        metadata = [name for name in names if name.endswith(".dist-info/METADATA")]
        if len(metadata) != 1:
            raise ValueError("distribution_metadata_missing")
        message = email.parser.BytesParser().parsebytes(archive.read(metadata[0]))
        if message["Version"] != version or message["Name"] != project["name"]:
            raise ValueError("distribution_wheel_version_mismatch")
    with tarfile.open(sdist, "r:gz") as archive:
        members = archive.getmembers()
        prefixes = {PurePosixPath(m.name).parts[0] for m in members}
        if len(prefixes) != 1 or len(members) > 10000:
            raise ValueError("distribution_sdist_root_invalid")
        actual = {}
        for member in members:
            validate_member(member.name)
            if member.isdir():
                continue
            if not member.isfile() or member.size > 16 * 1024 * 1024:
                raise ValueError("distribution_sdist_member_invalid")
            name = PurePosixPath(member.name).relative_to(next(iter(prefixes))).as_posix()
            if name in actual:
                raise ValueError("distribution_sdist_duplicate")
            actual[name] = archive.extractfile(member).read()
        if set(actual) - {"PKG-INFO"} != set(files) or any(
            actual.get(name) != raw for name, raw in files.items()
        ):
            raise ValueError("distribution_sdist_source_mismatch")
        if "PKG-INFO" in actual:
            metadata = email.parser.BytesParser().parsebytes(actual["PKG-INFO"])
            if metadata["Version"] != version or metadata["Name"] != project["name"]:
                raise ValueError("distribution_sdist_version_mismatch")
    for name in (
        "LICENSE",
        "src/skill_mng/resources/skills/skill-deep-audit/LICENSE",
        "regression/vendor/webapp-testing/LICENSE.txt",
        "regression/vendor/WEBAPP-TESTING-SOURCE.json",
    ):
        if not files.get(name):
            raise ValueError("distribution_license_or_provenance_missing")
    if runtime_requirements and requirements(runtime_requirements.read_bytes()) != requirements(
        files["requirements.lock"]
    ):
        raise ValueError("distribution_runtime_lock_mismatch")
    mapping = {p: digest(raw) for p, raw in sorted(files.items())}
    revision, dirty = None, None
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, timeout=5
        )
        status = subprocess.run(
            ["git", "status", "--porcelain", "--", "."], cwd=root, capture_output=True, text=True, timeout=5
        )
        if commit.returncode == 0 and status.returncode == 0:
            revision, dirty = commit.stdout.strip(), bool(status.stdout)
    except (OSError, subprocess.TimeoutExpired):
        pass
    return {
        "schemaVersion": 1,
        "version": version,
        "applicationFilesMatched": len(app),
        "sourceFilesMatched": len(files),
        "sourceTreeDigest": digest(json.dumps(mapping, sort_keys=True).encode()),
        "gitCommit": revision,
        "sourceWorkingTreeDirty": dirty,
        "sourceFiles": mapping,
        "runtimeLockMatched": bool(runtime_requirements),
        "licensesPreserved": True,
        "runtimeDataExcluded": True,
        "artifacts": {wheel.name: digest(wheel.read_bytes()), sdist.name: digest(sdist.read_bytes())},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--dist-dir", type=Path, default=Path("dist"))
    parser.add_argument("--runtime-requirements", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        project = tomllib.loads((args.root / "pyproject.toml").read_text())["project"]
        stem = project["name"].replace("-", "_") + "-" + project["version"]
        result = verify(
            args.root,
            args.dist_dir / (stem + "-py3-none-any.whl"),
            args.dist_dir / (stem + ".tar.gz"),
            args.runtime_requirements,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x") as stream:
            json.dump(result, stream, indent=2)
            stream.write("\n")
    except (OSError, ValueError, KeyError, tarfile.TarError, zipfile.BadZipFile):
        print(
            "Distribution verification failed; check source, artifact correspondence, locks and output path."
        )
        return 1
    print(
        json.dumps(
            {
                key: result[key]
                for key in ("version", "applicationFilesMatched", "sourceFilesMatched", "sourceTreeDigest")
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
