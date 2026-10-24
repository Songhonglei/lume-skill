# Machine and standalone contract

Python 3.11+, stdlib. All paths are local CLI arguments, not environment variables.

| Argument | Behavior |
| --- | --- |
| skill_path | Required existing target directory; no symlinks/special files |
| --depth L1/L2 | Default L1; overridden by manifest depth |
| --registered-version VERSION | Optional authoritative version, never latest lookup |
| --manifest PATH | Optional schemaVersion=1 fixed task JSON; depth/version/identities win |
| --artifact PATH | With manifest artifactDigest, required original ZIP for digest verification |
| --semantic-result PATH | Optional Agent evidence JSON; absent means incomplete semantic review |
| --output PATH | Required new directory outside target; result/report are exclusive create |

Manifest fields: schemaVersion, taskId, auditRunId, attemptId, leaseGeneration,
versionId, contentDigest, artifactDigest, registeredVersion, depth, ruleVersion.
IDs are 32 lowercase hex; digests 64 hex; generation >=1; ruleVersion must equal
`deep-audit-1.2.0-platform.1`. Identity mismatch or missing field exits 2. Directory
content digest is sorted path + NUL + file SHA256 + newline, compatible with registry.
An artifact is verified against artifactDigest and independently parsed to ensure
its normalized members match the directory bytes. No target scripts are executed.

Semantic evidence: {findings: [...], checkedRuleIds: [...], semanticCompleted: bool}.
Finding fields: ruleId, file (relative existing member), line (positive int), message,
suggestion, verification, reviewRequired (bool). IDs are generated deterministically.
Unknown/inactive IDs, invalid locations and duplicate IDs are rejected. Rule points
and severity come exclusively from rules.json; callers cannot override them.

Outputs: schemaVersion=1, manifest identity fields, score/maxScore/errorCount/
warningCount/reviewRequired/verdict, checkedRuleIds, semanticCompleted, findings,
repairPrompt, reportMarkdown and reportDigest (SHA256 of UTF-8 Markdown).
Exit 0 means completed (inspect verdict), 1 confirmed FAIL, 2 input/checker error.
Output directory must not exist. Read/parse/output failures stop; inspect paths,
permissions and limits, then retry with a new output directory. Do not fabricate
results. No network calls or retry loop is made by either standalone script.

Platform runner adds bounded model iterations, task leases and delivery retries;
those are separate platform responsibilities, not standalone dependencies.
