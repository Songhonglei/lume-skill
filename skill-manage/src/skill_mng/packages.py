"""Treat packages as data: validate and read ZIP members, never execute or extract them."""

import hashlib
import io
import json
import re
import stat
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

import yaml

MAX_PACKAGE = 16 * 1024 * 1024
MAX_CONTENT = 32 * 1024 * 1024
MAX_FILE = 4 * 1024 * 1024
MAX_FILES = 500
SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,79}\Z")
VERSION = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9._+-]{0,79}\Z")


class MetadataLoader(yaml.SafeLoader):
    """Read small frontmatter without alias expansion or unbounded collection depth."""

    def __init__(self, stream):
        super().__init__(stream)
        self.metadata_depth = 0
        self.metadata_nodes = 0

    def compose_node(self, parent, index):
        self.metadata_nodes += 1
        if self.check_event(yaml.AliasEvent) or self.metadata_depth >= 32 or self.metadata_nodes > 2048:
            raise yaml.YAMLError("frontmatter exceeds automatic parsing limits")
        self.metadata_depth += 1
        try:
            return super().compose_node(parent, index)
        finally:
            self.metadata_depth -= 1


def safe_path(name: str) -> str:
    if not name or len(name) > 500 or any(ord(c) < 32 for c in name) or "\\" in name or ":" in name:
        raise ValueError("文件路径包含不支持的字符")
    parts = name.split("/")
    if name.startswith("/") or any(p in ("", ".", "..") for p in parts):
        raise ValueError("包中含有越界或不规范的文件路径")
    return str(PurePosixPath(name))


@dataclass
class Package:
    raw: bytes
    artifact_digest: str
    content_digest: str
    metadata: dict
    files: list[dict]


def inspect_package(raw: bytes) -> Package:
    if len(raw) > MAX_PACKAGE:
        raise ValueError("ZIP 不能超过 16 MiB")
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise ValueError("请提供有效的 ZIP 下载包，普通网页不能导入") from exc
    entries: dict[str, bytes] = {}
    total = 0
    seen: set[str] = set()
    with archive:
        if len(archive.infolist()) > MAX_FILES * 2:
            raise ValueError("包内条目过多")
        for info in archive.infolist():
            path = safe_path(info.filename.rstrip("/") if info.is_dir() else info.filename)
            mode = info.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or info.flag_bits & 1:
                raise ValueError("不支持符号链接、特殊文件或加密 ZIP")
            if path.casefold() in seen:
                raise ValueError("包中存在重复文件路径（含大小写冲突）")
            seen.add(path.casefold())
            if info.is_dir():
                continue
            if info.file_size > MAX_FILE or len(entries) >= MAX_FILES:
                raise ValueError("单文件不能超过 4 MiB，文件数不能超过 500")
            total += info.file_size
            if total > MAX_CONTENT:
                raise ValueError("解压内容不能超过 32 MiB")
            try:
                with archive.open(info) as member:
                    content = member.read(MAX_FILE + 1)
            except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError) as exc:
                raise ValueError("ZIP 成员损坏或压缩方式不受支持") from exc
            if len(content) != info.file_size:
                raise ValueError("ZIP 成员大小与声明不一致")
            entries[path] = content
    prefix = ""
    if "SKILL.md" not in entries:
        roots = {p.split("/")[0] for p in entries}
        if len(roots) == 1:
            prefix = next(iter(roots)) + "/"
        if prefix + "SKILL.md" not in entries:
            raise ValueError("包根目录或唯一顶层目录中需要有 SKILL.md")
    document = entries[prefix + "SKILL.md"]
    if len(document) > 65536:
        raise ValueError("SKILL.md 不能超过 64 KiB")
    try:
        text = document.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("SKILL.md 需使用 UTF-8 编码") from exc
    metadata = {}
    lines = text.splitlines()
    if lines and lines[0].strip() == "---":
        try:
            end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
            loader = MetadataLoader("\n".join(lines[1:end]))
            try:
                parsed = loader.get_single_data()
            finally:
                loader.dispose()
            if isinstance(parsed, dict):
                metadata = {
                    key: str(parsed[key])[:2000]
                    for key in ("name", "version", "description")
                    if isinstance(parsed.get(key), (str, int, float))
                }
        except (StopIteration, yaml.YAMLError, RecursionError):
            # A registry must accept flawed Skills so later auditing can diagnose them.
            metadata["parse_warning"] = "YAML 头无法解析，请补填登记信息；原文件保持不变"
    identity = hashlib.sha256()
    files = []
    for archive_name, content in sorted(entries.items()):
        path = archive_name[len(prefix) :]
        content_hash = hashlib.sha256(content).hexdigest()
        identity.update(path.encode() + b"\0" + content_hash.encode() + b"\n")
        files.append(
            {"path": path, "archive_name": archive_name, "size": len(content), "digest": content_hash}
        )
    return Package(raw, hashlib.sha256(raw).hexdigest(), identity.hexdigest(), metadata, files)


def directory_zip(files: list[tuple[str, bytes]]) -> bytes:
    if not files or len(files) > MAX_FILES:
        raise ValueError("请选择 1–500 个文件")
    output = io.BytesIO()
    total = 0
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, content in files:
            safe_path(path)
            total += len(content)
            if len(content) > MAX_FILE or total > MAX_CONTENT:
                raise ValueError("目录内容超过大小限制")
            archive.writestr(path, content)
    raw = output.getvalue()
    if len(raw) > MAX_PACKAGE:
        raise ValueError("目录压缩后不能超过 16 MiB")
    return raw


def manifest_json(package: Package) -> str:
    return json.dumps(
        {"schema_version": 1, "metadata": package.metadata, "files": package.files}, ensure_ascii=False
    )
