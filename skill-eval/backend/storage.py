"""Bounded archive handling and immutable, content-addressed local storage."""
from __future__ import annotations

import base64
import hashlib
import io
import os
import re
import stat
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

import yaml

MAX_ARCHIVE = 100 * 1024 * 1024
MAX_EXPANDED = 500 * 1024 * 1024
MAX_FILES = 10_000


class PackageError(ValueError):
    pass


@dataclass(frozen=True)
class PackageFile:
    data: bytes
    mode: int = 0o644


def safe_path(value: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value or ":" in value:
        raise PackageError(f"无效的相对路径：{value!r}")
    if value.startswith("/") or any(part in {"", ".", ".."} for part in value.split("/")):
        raise PackageError(f"不允许绝对路径或跨目录引用：{value!r}")
    normalized = unicodedata.normalize("NFC", value)
    if len(normalized.encode("utf-8")) > 1024:
        raise PackageError("文件路径过长")
    return normalized


def validate_files(files: dict[str, PackageFile]) -> dict[str, PackageFile]:
    if len(files) > MAX_FILES:
        raise PackageError(f"文件数量超过 {MAX_FILES}")
    total = 0
    normalized, identities = {}, set()
    for original, file in files.items():
        path = safe_path(original)
        identity = path.casefold()
        if identity in identities:
            raise PackageError(f"存在重复或大小写冲突的路径：{original}")
        identities.add(identity)
        normalized[path] = file
        total += len(file.data)
        if total > MAX_EXPANDED:
            raise PackageError("解压后超过 500 MiB")
    for path in normalized:
        for parent in PurePosixPath(path).parents:
            if str(parent).casefold() in identities:
                raise PackageError(f"文件与目录路径冲突：{path}")
    directories = {}
    for path in normalized:
        for parent in PurePosixPath(path).parents:
            name = str(parent)
            if name.casefold() in directories and directories[name.casefold()] != name:
                raise PackageError(f"目录名称大小写冲突：{name}")
            directories[name.casefold()] = name
    return normalized


def files_digest(files: dict[str, PackageFile]) -> str:
    value = hashlib.sha256()
    for path, file in sorted(files.items()):
        encoded = path.encode()
        value.update(len(encoded).to_bytes(8, "big") + encoded)
        value.update(len(file.data).to_bytes(8, "big") + file.data)
    return value.hexdigest()


def unpack_zip(data: bytes) -> dict[str, PackageFile]:
    if len(data) > MAX_ARCHIVE:
        raise PackageError("压缩包超过 100 MiB")
    result, seen, expanded = {}, set(), 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if len(archive.infolist()) > MAX_FILES:
                raise PackageError(f"压缩包条目超过 {MAX_FILES}")
            for info in archive.infolist():
                original_name = info.orig_filename
                name = safe_path(original_name.rstrip("/") if info.is_dir() else original_name)
                key = name.casefold()
                if key in seen:
                    raise PackageError(f"压缩包存在重复或冲突路径：{name}")
                seen.add(key)
                mode = info.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if kind not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise PackageError(f"不支持符号链接或特殊文件：{name}")
                if info.flag_bits & 1:
                    raise PackageError("不支持加密压缩包")
                if info.is_dir():
                    continue
                if info.file_size > MAX_EXPANDED - expanded:
                    raise PackageError("解压后超过 500 MiB")
                with archive.open(info) as source:
                    content = source.read(MAX_EXPANDED - expanded + 1)
                expanded += len(content)
                if expanded > MAX_EXPANDED:
                    raise PackageError("解压后超过 500 MiB")
                result[name] = PackageFile(content, 0o755 if mode & 0o111 else 0o644)
    except (zipfile.BadZipFile, RuntimeError, OSError, NotImplementedError, EOFError) as error:
        raise PackageError("无法读取 ZIP 压缩包") from error
    return validate_files(result)


def pack_zip(files: dict[str, PackageFile]) -> bytes:
    normalized = validate_files(files)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, file in sorted(normalized.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | file.mode) << 16
            archive.writestr(info, file.data)
    data = output.getvalue()
    if len(data) > MAX_ARCHIVE:
        raise PackageError("导出包超过 100 MiB")
    return data


def extract_files(files: dict[str, PackageFile], destination: Path) -> None:
    """Destination must be a fresh task directory, never an existing workspace."""
    destination.mkdir(parents=True, exist_ok=False)
    for name, file in validate_files(files).items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(file.data)
        target.chmod(file.mode)


def find_skill(files: dict[str, PackageFile], selected: str | None = None) -> tuple[dict, dict]:
    roots = sorted(str(PurePosixPath(name).parent) for name in files if PurePosixPath(name).name == "SKILL.md")
    if selected is None:
        if len(roots) != 1:
            raise PackageError(f"需要唯一的 Skill 根目录，发现 {len(roots)} 个：{', '.join(roots)}")
        selected = roots[0]
    if selected not in roots:
        raise PackageError("指定目录不包含 SKILL.md")
    prefix = "" if selected == "." else selected + "/"
    normalized = {name[len(prefix):]: file for name, file in files.items() if name.startswith(prefix)}
    if "evals" in normalized:
        raise PackageError("evals 是评测集保留目录，不能是普通文件")
    try:
        text = normalized["SKILL.md"].data.decode("utf-8").replace("\r\n", "\n")
    except UnicodeDecodeError as error:
        raise PackageError("SKILL.md 必须是 UTF-8 文本") from error
    metadata = {}
    if text.startswith("---\n"):
        try:
            lines = text.splitlines()
            end = next((index for index, line in enumerate(lines[1:], 1) if line == "---"), None)
            if end is None:
                raise PackageError("SKILL.md 元信息缺少结束分隔行")
            metadata = yaml.safe_load("\n".join(lines[1:end])) or {}
        except yaml.YAMLError as error:
            raise PackageError("SKILL.md 的元信息不是有效 YAML") from error
    if not isinstance(metadata, dict):
        raise PackageError("SKILL.md 的元信息必须是对象")
    return normalized, {key: str(metadata.get(key) or "")[:2000] for key in ("name", "description", "version")}


def editor_files(files: dict[str, PackageFile]) -> dict:
    result = {}
    for name, file in files.items():
        try:
            value = {"encoding": "utf-8", "content": file.data.decode("utf-8")}
        except UnicodeDecodeError:
            value = {"encoding": "base64", "content": base64.b64encode(file.data).decode()}
        result[name] = {**value, "mode": file.mode}
    return result


def from_editor(payload: dict) -> dict[str, PackageFile]:
    result = {}
    for path, value in payload.items():
        if not isinstance(value, dict) or not isinstance(value.get("content"), str):
            raise PackageError(f"无效文件内容：{path}")
        try:
            if value.get("encoding") == "utf-8":
                content = value["content"].encode("utf-8")
            elif value.get("encoding") == "base64":
                content = base64.b64decode(value["content"], validate=True)
            else:
                raise PackageError(f"不支持的文件编码：{path}")
        except ValueError as error:
            raise PackageError(f"文件编码错误：{path}") from error
        result[path] = PackageFile(content, 0o755 if value.get("mode", 0) & 0o111 else 0o644)
    return validate_files(result)


class BlobStore:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def path(self, digest: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise PackageError("无效文件摘要")
        return self.root / digest[:2] / digest

    def put(self, data: bytes) -> str:
        digest = hashlib.sha256(data).hexdigest()
        target = self.path(digest)
        target.parent.mkdir(exist_ok=True, mode=0o700)
        if target.exists():
            self.get(digest)
        else:
            fd, temporary = tempfile.mkstemp(dir=target.parent, prefix=".upload-")
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, target)
            finally:
                Path(temporary).unlink(missing_ok=True)
        return digest

    def get(self, digest: str) -> bytes:
        content = self.path(digest).read_bytes()
        if hashlib.sha256(content).hexdigest() != digest:
            raise PackageError("持久化文件摘要不匹配")
        return content
