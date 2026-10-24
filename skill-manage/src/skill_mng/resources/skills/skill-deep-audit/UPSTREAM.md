# Upstream and provenance

Source: https://github.com/Songhonglei/build-better-skills/tree/23ea220eaccb58d2b701041f6b0772d3ed022ced/skills/skill-deep-audit

Pinned commit: 23ea220eaccb58d2b701041f6b0772d3ed022ced. Upstream documented version: 1.1.0.
License: MIT, original notice retained in LICENSE. No internal business code, logs,
credentials or datasets were copied. Generic requirements were reimplemented locally.

Fork version: 1.2.0-platform.1, rule version: deep-audit-1.2.0-platform.1.
This is a project-maintained fork, not an upstream release. Source whitelist:
SKILL.md, README.md, LICENSE, check-rules.md, controlled-domains.md,
output-template.md, scan-commands.md, check_path_boundary.py.
Scripts and workflow were rewritten for bounded reads, standalone/machine use,
frozen output, coverage gating and path analysis. The original write-in-target
report and optional --fix workflows are intentionally replaced by read-only outputs.
