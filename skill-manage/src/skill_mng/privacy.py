"""Conservative target-text privacy policy. Never changes source package bytes.

Detection is deliberately independent of the bundled Skill's narrower static rule.
Matches require human review, including examples; they are not proof of a live key.
"""

import re
from bisect import bisect_right


ASSIGNMENT = re.compile(
    r"(?i)\b[\w.-]*?(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|secret[_-]?key|"
    r"token|secret|password|passwd|passphrase|pwd|private[_-]?key|authorization|credential)s?"
    r"\b[\"']?[ \t]*(?::[ \t\r\n]*|=[ \t]*)"
)
PEM = re.compile(r"-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----")
BLOCK = re.compile(r"[|>](?:[1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#[^\r\n]*)?(?:\r?\n|$)")
REFERENCE = re.compile(
    r"(?:\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*|process\.env\.[A-Za-z_]\w*|"
    r"os\.(?:getenv\([\"'][A-Za-z_]\w*[\"']\)|"
    r"environ(?:\[[\"'][A-Za-z_]\w*[\"']\]|\.get\([\"'][A-Za-z_]\w*[\"']\))))"
)


def secret_spans(text):
    """Return value ranges in decoded text, before any chunking or diffing."""
    spans = []
    for match in PEM.finditer(text):
        end_marker = "-----END " + match[1] + "-----"
        end = text.find(end_marker, match.end())
        spans.append((match.end(), end if end >= 0 else len(text)))
    covered_until = 0
    for match in ASSIGNMENT.finditer(text):
        if match.start() < covered_until:
            continue
        start = match.end()
        if start >= len(text) or text[start] in "\r\n,}":
            continue
        if BLOCK.match(text, start):
            # YAML block scalar; retain the indicator and line structure.
            line_end = text.find("\n", start)
            if line_end < 0:
                continue
            line_start = text.rfind("\n", 0, match.start()) + 1
            prefix = text[line_start : match.start()]
            indent = len(prefix) - len(prefix.lstrip())
            cursor = line_end + 1
            end = cursor
            for line in text[cursor:].splitlines(keepends=True):
                if line.strip() and len(line) - len(line.lstrip()) <= indent:
                    break
                end += len(line)
            start = cursor
        elif text[start] in "\"'":
            quote = text[start]
            delimiter = quote * 3 if text.startswith(quote * 3, start) else quote
            start += len(delimiter)
            end = start
            while end < len(text):
                if text[end] == "\\":
                    end += 2
                elif text.startswith(delimiter, end):
                    break
                else:
                    end += 1
            end = min(end, len(text))
        else:
            reference = REFERENCE.match(text, start)
            if reference and (reference.end() == len(text) or text[reference.end()] in " \t\r\n#,;}]"):
                # The expression must end here; a literal fallback is still sensitive.
                tail = text[reference.end() :].split("\n", 1)[0].strip()
                if not tail or tail[0] in "#,;}]":
                    continue
            end = start
            # Mask the rest of an unquoted line too: punctuation may belong to
            # the secret, or to an expression with a hardcoded fallback.
            while end < len(text) and text[end] not in "\r\n":
                end += 1
            while end > start and text[end - 1].isspace():
                end -= 1
            # References contain no value to hide. Unknown expressions remain conservative matches.
            if text[start:end] in {"null", "None"} or REFERENCE.fullmatch(text[start:end]):
                continue
        if end > start and text[start:end].strip():
            spans.append((start, end))
            covered_until = end
    # Merge overlapping ranges, e.g. a PEM inside a quoted YAML/JSON value.
    merged = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def redact(text):
    """Mask values at equal character length, preserving CR/LF and offsets."""
    for start, end in reversed(secret_spans(text)):
        text = text[:start] + re.sub(r"[^\r\n]", "*", text[start:end]) + text[end:]
    return text


def redact_value(value):
    """Sanitize structured model messages without changing JSON framing or keys."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, dict):
        return {key: redact_value(item) for key, item in value.items()}
    return value


class TargetPrivacy:
    def __init__(self, files):
        self.locations = []
        values = set()
        for path, raw in files.items():
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                continue
            newlines = [m.start() for m in re.finditer("\n", text)]
            for start, end in secret_spans(text):
                self.locations.append((path, bisect_right(newlines, start - 1) + 1))
                # Also mask repeated values outside assignments and in diff context lines.
                for part in text[start:end].splitlines():
                    if part.strip():
                        values.update({part, part.strip()})
                        atom = re.split(r"[\s#,;}]", part.strip(), maxsplit=1)[0]
                        if atom:
                            values.add(atom)
                        values.update(re.findall(r"[\"']([^\"'\r\n]+)[\"']", part))
                        # A conservatively masked line can contain more than one
                        # assignment (e.g. TOKEN=one; PASSWORD=two).
                        for assignment in ASSIGNMENT.finditer(part):
                            tail = part[assignment.end() :]
                            value = re.split(r"[\s#,;}]", tail, maxsplit=1)[0].strip("\"'")
                            if value:
                                values.add(value)
        # One-character values still block the model and are masked in assignments.
        # Global replacement of tiny strings would destroy paths and report identities.
        self.values = sorted((value for value in values if len(value) >= 4), key=len, reverse=True)

    def redact(self, text):
        text = redact(text)
        for value in self.values:
            text = text.replace(value, "*" * len(value))
        return text

    def require_model_safe(self):
        if self.locations:
            raise ValueError("target_credentials_require_review")

    def validate_report(self, result):
        if self.locations and (
            result.get("semanticCompleted")
            or not result.get("reviewRequired")
            or result.get("verdict") == "pass"
            or not any(
                row.get("ruleId") == "D5-W3" and row.get("reviewRequired")
                for row in result.get("findings", [])
            )
        ):
            raise ValueError("target_credentials_require_review")
        # Reject rather than rewrite frozen reports: IDs and byte digests must remain bound.
        # The caller has already rebuilt the report and repair prompt from these
        # fields. Do not mistake coincidental matches in trusted IDs/line numbers
        # or scores for a disclosure of a short password.
        texts = [result.get("scopeReason", "")]
        for row in result.get("findings", []):
            texts.extend(row.get(key, "") for key in ("message", "suggestion", "verification"))
        if any(not isinstance(text, str) or self.redact(text) != text for text in texts):
            raise ValueError("target_credentials_in_report")
