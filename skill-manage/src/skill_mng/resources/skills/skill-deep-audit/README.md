# skill-deep-audit

Read-only Skill quality audit, independent of Open Skill Manager. Requires Python 3.11+
and an Agent for complete semantic review; static preflight needs only Python stdlib.

Copy this whole directory into your Agent's skills directory, then ask it to audit a
Skill directory. Read SKILL.md for boundaries and workflow.

```bash
python3 scripts/audit_package.py /path/to/target --depth L1 --output /path/to/new-report
```

Never place reports inside the target. Static preflight may finish successfully while
its verdict remains review_required. Full PASS requires semantic coverage, score >=90,
and zero ERR. No automatic repair or target code execution is provided.

Machine integration and all optional arguments: references/machine-contract.md.
MIT; original upstream and this fork's changes: UPSTREAM.md and CHANGELOG.md.
