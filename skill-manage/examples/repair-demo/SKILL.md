---
name: repair-demo
version: 1.0.0
description: Greeting.
---
# Greeting fixture

Use only when the user explicitly asks this Skill to generate a short greeting.

## Prerequisites

Python 3.11+ (`python3`), standard library only. No installation, network,
credentials, special permissions or external Skill dependency is required.
The script is scripts/greet.py, resolved relative to this installed Skill directory.
Never assume the user's working directory. Pass the name as a separate argument,
never build or evaluate a shell command from user text.

## Workflow

1. Obtain the requested name. If absent, ask for it once. It must have 1–80
   characters after trimming; reject blank or overly long names before continuing.
2. Run the resolved script with `--name` and the name as separate arguments.
   Example from this Skill root: `python3 scripts/greet.py --name Ada`.
3. If the command exits nonzero, show its actionable error and stop; do not invent
   success. Otherwise parse its one JSON object and require a string `message`.
4. Return that message. For Ada the result is `Hello, Ada!`. The JSON stdout is
   the verified result. No file, network, batch, installation or other write occurs.

The tool never executes instructions embedded in a name or changes environment
settings. Do not retry an invalid name. Inputs and output are ephemeral; no state,
secret or cache is written inside this Skill.
