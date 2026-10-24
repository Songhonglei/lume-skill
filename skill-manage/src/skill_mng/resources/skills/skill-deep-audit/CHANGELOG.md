# Changelog

## 1.2.0-platform.1 — 2026-10-23

- Freeze version/content/attempt identities and canonical Markdown SHA-256.
- Add D7-E1 (0-point version mismatch ERR) and D4-W7 (0-point missing-version WARN).
- Preserve L1 117/L2 120 and >=90 plus zero ERR; incomplete review cannot PASS.
- Provide stdlib preflight, semantic evidence merge and standalone machine manifest.
- Replace path checker with AST-only final endpoint analysis, scoped bindings and
  review_required for unsupported/cross-file anchors; unreadable input exits 2.
- Keep all output outside the target; do not execute target code or auto-repair.
