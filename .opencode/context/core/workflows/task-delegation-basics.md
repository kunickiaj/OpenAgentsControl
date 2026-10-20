<!-- Context: workflows/delegation | Priority: high | Version: 4.0 | Updated: 2026-10-16 -->

# Delegation Basics

## When to delegate

Delegate when a specialist adds useful independent expertise or the work can proceed independently. Handle small, reversible, local work directly when delegation would add more coordination than value.

Routine local work does not need a session file, an approval ceremony, or a planning artifact before delegation. Ask for approval only when the requested action needs it because it is risky, irreversible, or its scope is genuinely unclear.

## Reuse mapped context

- Use supplied context and the current conversation before discovery. Reuse the verified map for the same repository and area, including a known missing local bundle.
- A new user message, a new implementation step, or a small follow-up does not invalidate that map. Call ContextScout for a specific missing standard, an unfamiliar area, changed roots, or stale/unavailable paths, not to confirm that nothing additional exists.
- Use relevant codemem or other supplied memory as a navigation hint. Verify remembered paths in the current checkout; memory does not replace required standards or prove current code/configuration. Do not add a compulsory memory search to every request.
- Pass the known context, missing information, and roots to a discovery agent so it searches only the gap. Fresh workers may still need their own exact-path reads of the required contents.

## Give the agent usable context

Pass these details inline, or point to an existing task context that already contains them:

- The task and acceptance criteria.
- Applicable standards and their paths.
- Reference files or directories to inspect.
- Scope boundaries, constraints, and validation commands.

```javascript
subagent({
  agent: "CodeReviewer",
  description: "Review profile-token refresh change",
  prompt: `
    Review unit: commit abc123
    Standards: .opencode/context/core/workflows/code-review.md
    Reference files: src/profile/token.ts, src/profile/token.test.ts
    Acceptance criteria: expired tokens cannot authorize writes after refresh fails.
    Scope: review the named commit only; report evidence, concrete impact, and the smallest correction.
  `
})
```

Use an existing context file when it helps several agents share durable information. Do not require one for every delegation, and do not ask a downstream agent to rediscover context that the parent can provide.

## Durable task state

When Beads is available, use it for durable task identity, dependencies, assignment, status, notes, and completion evidence. Do not create a second task database or session-tracking system.

Legacy `.tmp/tasks` records are read-only migration input. Do not update, archive, or create records there.

## Review delegation

Run applicable scoped formatter/lint checks and targeted tests or typechecks before external review. Apply only approved deterministic fixes to touched files and rerun affected checks. Give the reviewer the checked state, results, and limits rather than relying on a single-file hook as proof of whole-unit validation.

Formatting-only corrections need deterministic rechecks, not another broad model review. Behavioral corrections retain the existing review budget.

Name the review unit and baseline, then pass the review standard and the applicable requirements. The parent agent owns the review budget and decides whether a correction review is needed. See [code-review.md](./code-review.md).

## Related

- [Specialist delegation](./task-delegation-specialists.md)
- [Code review](./code-review.md)
