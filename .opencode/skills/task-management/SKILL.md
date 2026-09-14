---
name: task-management
description: Use Beads to track task identity, dependencies, readiness, assignment, status, notes, and completion evidence
version: 2.0.0
author: opencode
type: skill
category: development
tags:
  - tasks
  - management
  - tracking
  - dependencies
  - beads
---

# Task Management with Beads

Beads (`bd`) is the durable task system. Agents may decompose work, but they must store task state in Beads rather than `.tmp/tasks`, session files, or ad-hoc markdown.

## Start here

Use the installed client's help because Beads command flags can differ by version:

```text
bd --help
bd ready
bd show <id>
```

Typical lifecycle commands are:

```text
bd create "<title>" --type task --description "<scope>" --acceptance "<criteria>"
bd update <id> --status in_progress
bd close <id> --reason "<completion evidence>"
```

Use `bd create --help`, `bd update --help`, or `bd close --help` before adding dependencies or notes when syntax is uncertain. Do not invent flags.

## Ownership contract

Beads owns:

- stable task IDs and parent/child relationships;
- dependency links and readiness;
- assignment and status;
- blockers and notes;
- acceptance criteria and completion evidence.

Agent prompts may carry working context, reference files, and validation commands, but they must refer back to a bead ID when durable tracking is required.

## Workflow

1. Run `bd ready` before creating work.
2. Inspect likely matches with `bd show <id>` and reuse existing beads instead of duplicating them.
3. Create one parent bead for the review unit and child tasks for independently verifiable work.
4. Add dependency links so readiness reflects the real execution order.
5. Claim a task before implementation with `bd update <id> --status in_progress`.
6. Verify acceptance criteria and targeted checks before closing it.
7. Include concrete completion evidence in the close reason or notes.
8. Run `bd ready` again to find newly unblocked work.

## Failure handling

If `bd` is missing, unhealthy, or reports a schema mismatch, stop durable task operations and report:

- the exact failed command and error;
- the installed client version when available;
- the safest recovery action.

Never bypass a schema mismatch unless the user explicitly accepts the compatibility risk. Never create fallback state under `.tmp/tasks`.

## Legacy `.tmp/tasks` compatibility

Legacy task JSON may be read only when an existing workflow names it. Emit this warning:

```text
Deprecated task state detected. This `.tmp/tasks` plan is read-only; migrate new status and dependency state to Beads.
```

Map the feature to a parent bead and subtasks to child beads. Preserve objectives, acceptance criteria, deliverables, and dependencies. Do not update counters, statuses, timestamps, or archive folders in the legacy files.

The legacy router and `task-cli.ts` remain packaged for one compatibility window, but new agent workflows must not call them.
