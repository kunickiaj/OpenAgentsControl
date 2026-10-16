<!-- Context: workflows/review | Priority: high | Version: 3.0 | Updated: 2026-10-16 -->

# Code Review Guidelines

> **Reference:** The full guidance is in [`code-review.md`](./code-review.md).

## Quick reference

- Review one named unit from a stable baseline.
- Use **CodeReviewer** by default; use **AdversarialReviewer** for a targeted skeptical review; use **gordon-ramsay** only when the user explicitly asks for that persona.
- Block only Critical, High, or concrete Medium findings. Keep simplification and style suggestions non-blocking.
- Support each finding with changed-code evidence, a concrete impact, and the smallest correction.
- `SHIP` means no blockers were found in the reviewed scope. It does not authorize a merge or certify a complete audit.
- The parent owns the budget: one initial review and one delta correction review per unit. Do not create review cascades.

For the report format, severity definitions, and evidence standard, see [code-review.md](./code-review.md).
