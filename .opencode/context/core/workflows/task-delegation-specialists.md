<!-- Context: workflows/delegation-specialists | Priority: high | Version: 1.1 | Updated: 2026-10-16 -->
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

## TestEngineer - Test Authoring

**✅ DELEGATE when:**
- Writing comprehensive test suites
- TDD workflows (tests before implementation)
- Complex test scenarios (edge cases, error handling)
- Integration tests across multiple components

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
- Implementing atomic subtasks from TaskManager
- Isolated feature work (single component/module)
- Following specific implementation specs

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
| Test suite for auth | TestEngineer | Comprehensive coverage |
| Security review | CodeReviewer | Security focus |
| Single API endpoint | CoderAgent | Focused implementation |
| Complex multi-file feature | TaskManager → CoderAgent | Breakdown then implement |

---

## Key Principle

Give TestEngineer and CodeReviewer the standards, source references, acceptance criteria, and validation evidence they need. An existing task context can carry those details, but a new session context is optional.

---

## Related

- `task-delegation-basics.md` - Core delegation workflow
- `task-delegation-caching.md` - Context caching
- `design-iteration-overview.md` - OpenFrontendSpecialist workflow
