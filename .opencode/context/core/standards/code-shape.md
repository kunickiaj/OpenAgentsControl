<!-- Context: standards/code-shape | Priority: critical | Version: 1.0 | Updated: 2026-09-03 -->
# Code Shape

Use these five patterns when writing or restructuring code.

1. **Replace nested ternaries with branches or a lookup.** (`noNestedTernary`)
   - **Bad:** `const label = a ? "x" : b ? "y" : "z";`
   - **Good:** `let label = "z"; if (a) label = "x"; else if (b) label = "y";`
2. **Use guard clauses; do not nest preconditions.** (`noExcessiveCognitiveComplexity`)
   - **Bad:** `if (user) { if (user.active) { if (canEdit) edit(); } }`
   - **Good:** `if (!user?.active || !canEdit) return; edit();`
3. **Pass named options; do not pass opaque boolean literals. Predicate return values are fine.**
   - **Bad:** `render(item, true, false);`
   - **Good:** `render(item, { compact: true, showMeta: false });`
4. **Extract named stages when a function needs comments to label its sections.** (`noExcessiveLinesPerFunction`)
   - **Bad:** `/* validate */ ... /* persist */ ... /* notify */ ...`
   - **Good:** `const record = validate(input); persist(record); notify(record);`
5. **Use JSX ternaries only for single-expression leaves; move branching outside nested markup.** (`noNestedTernary`)
   - **Bad:** `{ready ? <A>{active ? <B /> : <C />}</A> : <D />}`
   - **Good:** `if (!ready) return <D />; const child = active ? <B /> : <C />; return <A>{child}</A>;`
