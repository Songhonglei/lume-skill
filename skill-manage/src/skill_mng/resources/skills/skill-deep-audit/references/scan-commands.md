# Read-only scan guidance

Use `scripts/audit_package.py` for bounded file inventory, syntax parsing and known
static rules. Use `scripts/check_path_boundary.py` for D3-E5. Pass target paths as
separate CLI arguments; never concatenate them into a shell command.

For D7-W2, inspect Python imports with AST or Agent reads, then classify each as
stdlib, third-party package, local module or a separate Skill. Confirm physical
ownership before declaring a Skill dependency. An import alone is not evidence
of a missing Skill. Read callers and `sys.path` changes; record dependency purpose
and whether local evidence resolves it. Optional Hub absence follows D7-W1 WARN.

For D7-W3, count source files and lines from the fixed file inventory. Exclude
`.git`, dependency caches and binary assets from code counts; separately report
packaging clutter. Do not silently skip unreadable required resources.

For D6, reason about control flow and parse code without executing/importing the
target. L2 branch reachability is a read-only simulation. Do not install dependencies
or run target tests. Report unresolved dynamic calls as REVIEW with a caller location.
