---
name: engineering-briefs
description: Use when writing or revising an engineering decision brief, proposal, results or outcomes memo, recommendation, next-steps note, or internal sharing document.
---

# Engineering Briefs

Use this skill to shape source-grounded engineering prose into a short, decision-useful brief. It adds a lightweight writing method; it does not require a platform API, a multi-agent pipeline, or a separate fact-ledger system.

## Reader Contract

When the source supports them, answer these questions within the reader's first minute:

1. What happened, what does it do, or what is proposed?
2. Why does it matter?
3. What was decided, recommended, or proposed?
4. What happens next?

Do not force an answer that the source does not contain. A proposal remains a proposal, and missing owners, dates, thresholds, or approvals remain unresolved.

## Lightweight Method

1. Identify the audience, purpose, and decision state.
2. Extract observed evidence, interpretation, decision or proposal, limits, next steps, and unresolved items.
3. Keep those claim types visibly distinct through wording, paragraph order, or headings; do not force every type into its own section.
4. Lead with the outcome, recommendation, proposal, or current state.
5. Define an unfamiliar term at first use or remove it.
6. Put numeric comparisons in a Markdown table and state the conclusion in prose.
7. Keep the main body readable in about three minutes.
8. Move detailed evidence, methodology, secondary caveats, and superseded work to an appendix when readers still need them.

## Source Fidelity

- Preserve supplied facts, uncertainty, and decision state.
- Never invent results, decisions, owners, dates, quotations, thresholds, or causal claims.
- Do not convert correlation into causation.
- Do not turn a recommendation or proposal into an approved decision.
- Mark material gaps as unresolved instead of filling them plausibly.

## Suggested Structures

Use only the sections that help the document.

### Result or Outcome

- Outcome and why it matters
- Evidence
- Interpretation
- Decision or recommendation, if one exists
- Limits and unresolved items
- Next steps
- Appendix, if needed

### Proposal or Recommendation

- Proposed path and why it matters
- Problem or opportunity
- Supporting evidence
- Tradeoffs and limits
- Decision requested
- Unresolved items
- Next steps
- Appendix, if needed

### Decision

- Decision and why it matters
- Context and evidence
- Alternatives or tradeoffs that affected the choice
- Consequences and limits
- Owner and next steps, only when supplied
- Unresolved items
- Appendix, if needed

## Final Reader Test

Before returning the brief, confirm that a reader can answer the four questions without searching the appendix:

- What happened, what does it do, or what is proposed?
- Why does it matter?
- What was decided, recommended, or proposed?
- What happens next?

If the source cannot answer one, state that gap plainly rather than inventing it.
