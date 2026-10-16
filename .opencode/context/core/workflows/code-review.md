<!-- Context: workflows/review | Priority: high | Version: 3.0 | Updated: 2026-10-16 -->

# Code Review Guidelines

## Review outcome

Review one named unit against a stable baseline: a bead, commit, pull request, or explicitly named work slice. Report only findings supported by the changed code and the applicable requirements.

`SHIP` means the reviewer found no blockers in the reviewed scope. It is not authorization to merge, proof that every behavior was audited, or a substitute for required validation.

These reviewer definitions use native OpenCode V2 frontmatter. Keep legacy keys such as `name`, `temperature`, and `permission` out of them: on V2.0.29, mixing `name` with native `permissions` caused those rules to become request data instead of active permissions. Verify effective permissions after configuration merges; inherited shell rules and read-only instructions are not an operating-system sandbox.

## Reviewer roles

### CodeReviewer

Use **CodeReviewer** as the default reviewer. It gives neutral, evidence-based feedback on requirements, correctness, compatibility, security, tests, and maintainability that the change affects.

### AdversarialReviewer

Use **AdversarialReviewer** only for a named concern — an assumption, unnecessary complexity, custom machinery, or a credible failure path — that can change the decision. It is not a routine second general review, including for high-risk changes. It is skeptical, professional, and profanity-free; it challenges requirements and engineering decisions without inventing hypotheticals to create findings.

### gordon-ramsay

**gordon-ramsay** remains an opt-in persona for users who explicitly request harsh feedback. It is not a replacement for either review role or a default review style.

## Severity and blocking

Rank findings by their actual impact, not by a checklist category.

| Severity | Meaning | Review result |
| --- | --- | --- |
| Critical | A reachable catastrophic failure, such as broad data exposure or destructive loss | Blocks |
| High | A reachable serious correctness, security, or compatibility failure | Blocks |
| Medium | A concrete defect or demonstrated maintenance cost with narrower impact | Blocks only for a concrete unmet requirement, correctness defect, or compatibility issue; explain why |
| Low | A non-blocking simplification, style, or follow-up suggestion | Does not block |

Missing tests, low coverage, performance concerns, or code style are findings only when the reviewer can connect them to a concrete requirement, reachable failure, or demonstrated maintenance cost. Do not use arbitrary coverage targets.

## Evidence standard

Each finding includes:

1. **Evidence:** file and line or a precise changed-code reference.
2. **Impact:** a concrete scenario, unmet requirement, or demonstrated maintenance cost.
3. **Smallest correction:** the minimal change that resolves the issue.

If one of these cannot be stated, record the concern as a question or omit it. Do not require positive observations, and do not force reports into a fixed number of findings.

## Review process

1. Identify the review unit, stable baseline, changed files, applicable requirements, and validation already run.
2. Inspect the diff and relevant call paths for behavior the change can reach.
3. Report blockers and optional suggestions separately.
4. After corrections, review only the delta and unresolved findings.

The parent agent owns the review budget. A review unit receives at most one initial review and one correction review. Do not trigger review cascades or restart a broad review after a correction unless the behavior boundary changed, validation failed, a new high-risk finding appeared, or the user requested another pass.

## Report format

```markdown
## Review: {review unit}

**Scope:** {baseline, changed files, and requirements reviewed}
### Blockers
- **[High]** `src/example.ts:42` — `saveProfile` accepts an expired token after refresh fails.
  - **Scenario:** A client retry can write a profile after its authorization has expired.
  - **Smallest correction:** Return the refresh error before calling `writeProfile`.

### Validation reviewed
- `npm test -- profile`

REQUEST CHANGES
```

The example structure is optional; the verdict contract is not. Label each finding `blocking` or `non-blocking`, keep optional suggestions separate, and report checks actually run and any limitations before the final line. End with exactly one bare `REQUEST CHANGES` when blockers remain, or `SHIP` when none were found in the inspected scope.

When there are no blockers, say none were found in the reviewed scope; do not invent optional suggestions. If scope or evidence is insufficient, mark the review incomplete and explain that `SHIP` is not approval of the requested scope. The parent must read these limitations before acting on a verdict.
