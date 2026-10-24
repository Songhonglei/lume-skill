"""Candidate-only edits and bounded, redacted diffs; never touches an installed Skill."""

import difflib
import hashlib
import io
import json
import re
import zipfile

from .packages import inspect_package


def unpack(raw):
    package = inspect_package(raw)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        return package, {f["path"]: archive.read(f["archive_name"]) for f in package.files}


def pack(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, raw in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, raw)
    raw = buffer.getvalue()
    inspect_package(raw)
    return raw


def bump_version(raw, version):
    text = raw.decode("utf-8-sig")
    match = re.match(r"^---\s*\n(.*?)\n---(?:\n|$)", text, re.S)
    if not match:
        raise ValueError("SKILL.md 需要可解析的 YAML 头才能自动调整版本")
    header = match[1]
    declaration = "version: " + json.dumps(version)
    if re.search(r"^version\s*:", header, re.M):
        header = re.sub(r"^version\s*:.*$", lambda _: declaration, header, flags=re.M)
    else:
        header += "\n" + declaration
    text = "---\n" + header + "\n---\n" + text[match.end() :]
    text = re.sub(
        r"((?:\*\*)?(?:Version|版本)(?:\*\*)?\s*[:：]\s*`?)[A-Za-z0-9._+\-]+",
        lambda m: m[1] + version,
        text,
        flags=re.I,
    )
    return text.encode()


LITERAL_SECRET = re.compile(
    r"(?i)(\b(?:api[_-]?key|token|secret|password)[\"']?\s*[:=]\s*[\"'])([^\"'\r\n]{20,})([\"'])"
)


def redact(text):
    return LITERAL_SECRET.sub(lambda m: m[1] + "*" * len(m[2]) + m[3], text)


def changes(before, after):
    result = []
    total = 0
    for path in sorted(set(before) | set(after)):
        old, new = before.get(path), after.get(path)
        if old == new:
            continue
        entry = {
            "path": path,
            "beforeDigest": hashlib.sha256(old).hexdigest() if old is not None else None,
            "afterDigest": hashlib.sha256(new).hexdigest() if new is not None else None,
            "kind": "added" if old is None else "removed" if new is None else "modified",
        }
        try:
            a = redact((old or b"").decode("utf-8-sig")).splitlines(keepends=True)
            b = redact((new or b"").decode("utf-8-sig")).splitlines(keepends=True)
            entry["diff"] = "".join(
                difflib.unified_diff(a, b, fromfile="original/" + path, tofile="candidate/" + path)
            )
            entry["binary"] = False
        except UnicodeDecodeError:
            entry["diff"] = "Binary file: content omitted."
            entry["binary"] = True
        total += len(entry["diff"].encode())
        if total > 200000:
            raise ValueError("候选差异超过 200 KB，需缩小修复范围后重新创建任务")
        result.append(entry)
    return result
