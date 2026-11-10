<!-- Context: workflows/delegation-specialists | Priority: high | Version: 1.2 | Updated: 2026-11-10 -->
# When to Delegate to Specialists

**Purpose**: Guidance on when to delegate to specific specialist agents. Pass standards, reference paths, scope, and acceptance criteria inline or through an existing task context; do not require a new session file for routine local work.

Supply known standards, mapped or missing context, scope, acceptance criteria, and validation results rather than making each specialist rediscover them.

---

## OpenFrontendSpecialist - UI/UX Design

**✅ DELEGATE when:**
- Creating new UI/UX designs (landing pages, dashboards)
- Building design systems (components, themes, style guides)
- Complex layouts requiring responsive design
- Visual polish (animations, transitions, micro-interactions)
- Brand-focused pages (marketing, product showcases)
- Accessibility-critical UI

**Delegation pattern:**
```javascript
subagent({
  agent: "OpenFrontendSpecialist",
  description: "Design {feature} UI",
  prompt: `
    Design {feature}.
    Standards: {design standards paths}
    Reference files: {relevant files}
    Acceptance criteria: {expected UI and accessibility outcomes}
  `
})
```

**Why?** Applies UI and accessibility expertise to work that needs design judgment.

---

## TestEngineer - Independent Test Work

Whoever implements a change writes and runs its tests. Use TestEngineer only for test work that stands apart from an in-progress change.

**✅ DELEGATE when:**
- Reproducing a reported bug before a fix is designed
- Adding coverage for existing behavior that is not being changed
- Verifying built behavior, such as a browser or integration check, while other work continues

**❌ KEEP with the implementer:**
- Tests for a change that is being written now

**Delegation pattern:**
```javascript
subagent({
  agent: "TestEngineer",
  description: "Write tests for {feature}",
  prompt: `
    Write tests for {feature}.
    Standards: {test standards paths}
    Reference files: {file list}
    Acceptance criteria: {behaviors and error cases that must pass}
  `
})
```

---

## CodeReviewer - Quality Assurance

Use **CodeReviewer** as the default review agent. Use **AdversarialReviewer** only for a named concern — an assumption, unnecessary complexity, custom machinery, or a credible failure path — that can change the decision. It is not a routine second general review, including for high-risk changes. See [code-review.md](./code-review.md) for severity, evidence, and review-budget rules.

**✅ DELEGATE when:**
- The user requests a review.
- A medium/high-impact behavior change is stable and ready for its initial review.
- Self-review leaves a concrete correctness, compatibility, security, or maintainability question.

**Delegation pattern:**
```javascript
subagent({
  agent: "CodeReviewer",
  description: "Review {feature}",
  prompt: `
    Review unit: {commit, pull request, bead, or named work slice}
    Baseline: {baseline}
    Exact diff or head: {diff or head}
    Pass type: {initial or correction}
    Prior finding fingerprints and status: {findings or none}
    Completed deterministic checks and limits: {results}
    Standards: .opencode/context/core/workflows/code-review.md, {other standards paths}
    Reference files: {file list}
    Acceptance criteria: {requirements}
    Review the scoped change only. Report blockers with evidence, concrete impact, and the smallest correction.
  `
})
```

---

## CoderAgent - Focused Implementation

**✅ DELEGATE when:**
- An implementation slice needs little from the rest of the change and can run in parallel with other work
- Implementing atomic subtasks from TaskManager

CoderAgent writes and runs the tests for its slice. Keep tightly coupled edits in one session.

**Delegation pattern:**
```javascript
subagent({
  agent: "CoderAgent",
  description: "Implement {subtask}",
  prompt: `
    Implement: {description}
    Standards: {standards paths}
    Reference files: {relevant files}
    Acceptance criteria: {completion conditions}
    Validation: {commands}
  `
})
```

---

## Decision Matrix

| Scenario | Agent | Why |
|----------|-------|-----|
| New landing page | OpenFrontendSpecialist | UI and accessibility expertise |
| Feature and its tests | Current session | The implementer owns its tests |
| Tightly coupled multi-file change | Current session | Shared context across the edits |
| Coverage for existing, unchanged auth code | TestEngineer | Independent of work in progress |
| Security review | CodeReviewer | Independent verification |
| Independent API endpoint alongside other work | CoderAgent | Parallel slice with its own tests |
| Feature with independent slices and real dependencies | TaskManager → CoderAgent per slice | Breakdown then parallel implementation |

---

## Key Principle

Give TestEngineer and CodeReviewer the standards, source references, acceptance criteria, and validation evidence they need. An existing task context can carry those details, but a new session context is optional.

---

## Related

- `task-delegation-basics.md` - Core delegation workflow
- `task-delegation-caching.md` - Context caching
- `design-iteration-overview.md` - OpenFrontendSpecialist workflow
