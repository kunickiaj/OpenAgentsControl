# Plan: Three-Layer Code Quality Enforcement for Coding Agents

**Status:** Draft v2 — reviewed for noise, duplication, and rollout risk
**Primary targets:** OpenAgent, CoderAgent (this repo); codemem as the first real project
**Problem:** Agent-written code is drifting toward nested conditionals, long functions, and ternary soup. Prose standards ("keep functions small") are not changing behavior.

## Decision summary

Enforce quality with three layers, ordered by leverage: (1) linter rules surfaced immediately after edits without allowing regressions, (2) a five-rule before/after file in each repo, (3) a hard-verdict reviewer for medium/high-risk work. Layer 1 handles mechanical code shape; layer 3 must not repeat the linter.

Two facts discovered while scoping change the original sketch:

| Assumption | Reality | Consequence |
|---|---|---|
| codemem uses ESLint | codemem uses Biome 2.5 (`biome.json`, `pnpm run lint`) | Use Biome-native rules; no ESLint/sonarjs/unicorn install |
| CoderAgent can run the linter | CoderAgent has `bash: "*": deny` | Lint feedback must come from a plugin hook, not the agent |

## Current state audit: what exists, what it actually does

Takeaway: versions of all three layers exist, but the targeted code-shape controls neither fail nor feed useful results back to the model.

| Layer | What exists today | Does it fail / feed back? | Gap |
|---|---|---|---|
| 1 Lint | codemem: Biome `recommended` + 9 handpicked rules, lint-staged pre-commit, `pnpm run lint` in CI | Yes for the rules that are on, but no complexity/length/nesting rules are on | Enable the shape rules; today they are silent |
| 1 Feedback hook | codemem `.claude/settings.json` → `"hooks": {}`; OpenCode `coder-verification` plugin | No. `coder-verification` greps CoderAgent's *text output* for the string "Self-Review" and shows a toast. It never runs a linter and returns nothing to the model | Replace with a real post-edit lint hook |
| 1 Agent loop | CoderAgent Step 7 self-review (types, imports, anti-pattern grep, acceptance criteria); OpenCoder rule "ALWAYS validate after each step (type check, lint, test)" | CoderAgent cannot run lint (`bash: "*": deny`). OpenCoder's rule is prose with no mechanism | Lint step has to be injected, not requested |
| 2 Rules file | `code-quality.md`: "< 50 lines", "use early returns", "deep nesting" as ❌ bullets. codemem `AGENTS.md`: CLI nesting rule (command groups, not code) | Adjectives and thresholds, zero before/after pairs | Add the five-pair file |
| 3 Review | CodeReviewer: read-only, *may* run linters, severity-ordered output. `code-review.md` checklist lists "Large functions (>50)" and "Deep nesting (>3)" as 🟡 warnings | No terminal verdict, no hard-fail, code-shape items are 🟡 and get buried under security/correctness sections | Checklist + `SHIP`/`REQUEST CHANGES` contract + routing |

### codemem baseline (Biome 2.5, `packages/`, defaults: complexity 15, 50 lines)

| Rule | `src` violations | test-file violations |
|---|---|---|
| `noExcessiveCognitiveComplexity` (>15) | 528 | 31 |
| `noExcessiveLinesPerFunction` (>50) | 507 | 750 |
| `noNestedTernary` | 266 | 12 |

That is the sloppiness you are seeing, quantified: Biome reports 528 complexity diagnostics in shipping code at its *default* ceiling, before tightening to 10. Turning these on as `error` tomorrow would break every PR. This forces a no-regression ratchet rather than a flag-day.

### Ranked improvements over what exists

1. **Enable three shape rules in codemem at `warn`, then `error` per package as each is cleaned.** Cognitive complexity, function length, nested ternaries. Do not add adjacent style rules until these prove useful.
2. **Real edit lint hook** for OpenCode first, then Claude Code, returning only regressions in the touched file. Keep `coder-verification` until the replacement works, then retire it; today it is string-matching theater.
3. **Reviewer verdict contract.** Add code-shape checklist and a mandatory terminal `SHIP` / `REQUEST CHANGES` to `reviewer.md`; the benchmark evaluator already expects that token, so the agent prompt is currently out of sync with its own eval.
4. **Do not expand CodeReviewer routing. Measure it first.** OpenAgent only says to use CodeReviewer for review/risk/quality work; the global risk table already makes it optional for low risk and required for medium/high. Instrument calls for two weeks. If low-risk calls are excessive, replace the ambiguous "when uncertainty is non-trivial" wording with concrete triggers rather than adding another routing rule.
5. **Five-pair `code-shape.md`** loaded by CoderAgent/OpenAgent/OpenCoder before writing code; link from codemem `AGENTS.md`.
6. **CoderAgent Step 7 gets "Check 0: lint clean"** keyed off the hook output, since it cannot run lint itself.

## Layer 1: Lint rules that fail, fed back on every edit

Takeaway: turn on Biome's complexity rules in codemem and wire a `tool.execute.after` hook so the agent sees violations right after `edit`/`write`.

### 1a. Biome rule set for codemem

Add to `biome.json` `linter.rules`:

```json
"complexity": {
  "noExcessiveCognitiveComplexity": { "level": "warn", "options": { "maxAllowedComplexity": 15 } },
  "noExcessiveLinesPerFunction": { "level": "warn", "options": { "maxLines": 50, "skipBlankLines": true } }
},
"style": {
  "noNestedTernary": "warn"
}
```

Notes:
- Biome has no `max-depth`. Cognitive complexity penalizes each nesting level, which catches most of the same code. Revisit if depth-only offenders slip through.
- "No boolean parameters" has no Biome rule. That lives in layer 2/3.
- Baseline is 528 / 507 / 266 src violations (see audit). Set the three rules to `warn` globally and add `overrides` that set `error` for packages once cleaned. Start at Biome's complexity default of 15; tighten to 10 only after measuring false positives and refactor quality.
- Give tests a higher function-length ceiling (for example 100), not a blanket exemption. Long `describe` callbacks are normal; giant test helpers are not.
- The hook, not CI, is the enforcement surface during the ratchet. CI stays green; the agent sees warnings and is told (layer 2 rule) that warnings on lines it touched are blocking.
- Python equivalents for other projects: ruff `C901` (complexity 10), `PLR0912` (branches), `PLR0913` (args), `PLR0915` (statements), `SIM` rules. Go: `gocyclo`, `nestif`, `gocognit`.

### 1b. Feedback hook

Claude Code path (codemem `.claude/settings.json`, currently `{"hooks": {}}`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "scripts/agent-lint-hook.sh snapshot" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "scripts/agent-lint-hook.sh compare" }]
      }
    ]
  }
}
```

The Claude Code version needs paired `PreToolUse` and `PostToolUse` hooks: pre-edit captures rule counts, post-edit reruns Biome and reports count increases. A PostToolUse-only hook cannot distinguish legacy findings from regressions. Validate hook JSON and exit-code behavior against current Claude Code docs before implementation.

OpenCode path (this repo, and installed into codemem via `.opencode/plugins/`):

- New plugin `lint-feedback` using paired `tool.execute.before` / `tool.execute.after` hooks, following the shape already in `.opencode/plugin/agent-validator.ts`.
- Pilot with an explicit codemem Biome command. Do not auto-detect and execute arbitrary repo tooling in v1; generalized ESLint/Ruff/Go adapters can follow after the contract works.
- Cover every file-mutation tool exposed to agents (`edit`, `write`, and `apply_patch` when present), not only two hard-coded names.
- This is what makes CoderAgent work despite `bash: deny`: the plugin runs the linter, the agent only sees results.
- **No-regression reporting is what keeps this from being aggressive.** Compare before and after per rule; location-based fingerprints break when an edit shifts lines. If anything got worse, return the relevant post-edit diagnostics, capped (for example 10) with a terse summary. Legacy files like `team-setup.ts` carry 29 pre-existing findings; dumping all of them after a one-line edit either gets ignored or triggers an unrequested refactor. Biome on a single file is ~200ms, so cost is not the concern.
- **Compare values, not just counts.** The common way sloppiness compounds is an agent adding 10 lines to a function that is already over the limit; the diagnostic count for the file does not change, so a count-only delta stays silent. Biome's messages carry the measured value ("complexity of 22 detected (max: 15)", "function has 63 lines"). Parse those and treat any per-function value increase as a regression. Nested-ternary stays count-based.
- **Scope rule for the agent when the hook fires:** fix it if you created the function or the fix is local to the lines you changed. If the regression is inside a legacy function you barely touched and fixing means restructuring it, do not refactor; note it in the completion summary. This is what prevents trading ugly-code churn for scope-creep churn.
- This guard can still miss a replacement (one old violation removed, one new one added at equal value). Accept that for the pilot; CI and medium/high review remain the backstop.
- Open question: should the plugin also block (`throw`) on error-level findings so the tool call itself fails? Appending is less disruptive; blocking is closer to "can't finish until green." Start with append, measure whether agents ignore it.

### 1c. Verification that the loop closes

- CoderAgent Step 7 self-review adds: "Check 0: no new lint diagnostics — every reported regression was fixed before completion."
- OpenAgent validation section adds the same rule for direct edits.

## Layer 2: Five concrete rules with before/after pairs

Takeaway: replace adjective-based guidance with five pattern pairs, placed where the model reads them: a shared context file here, and a short section in codemem's `AGENTS.md`.

New file: `.opencode/context/core/standards/code-shape.md` (name open). Referenced from `code-quality.md` and loaded by CoderAgent/OpenAgent before writing code. Content, roughly:

```
1. Nested ternary → if/else or lookup table
   bad:  const label = a ? "x" : b ? "y" : "z";
   good: const LABELS = { a: "x", b: "y" }; const label = LABELS[key] ?? "z";

2. Guard clauses, not nested ifs
   bad:  if (user) { if (user.active) { if (perm) { doThing(); } } }
   good: if (!user?.active || !perm) return; doThing();

3. No opaque positional booleans at call sites
   bad:  render(item, true, false)
   good: render(item, { compact: true, showMeta: false })  // predicates returning boolean are fine

4. Extract when a function needs section comments
   bad:  // --- validate ---  ... // --- persist --- ... // --- notify ---
   good: validate(input); persist(record); notify(record);

5. Ternaries in JSX only for single-expression leaves
   bad:  {cond ? <A>{nested ? <B/> : <C/>}</A> : <D/>}
   good: if (!cond) return <D/>; const inner = nested ? <B/> : <C/>; return <A>{inner}</A>;
```

Rules for the rules file: five items max, each with a 3-line bad/good pair, no adjectives, no "should." Anything a linter already enforces gets one line pointing at the rule name, not a paragraph.

codemem `AGENTS.md` gets a "Code shape" section that either inlines these five or links to the file, plus one line: "Lint diagnostics returned after an edit are blocking. Fix them before continuing."

Existing `code-quality.md` already says "< 50 lines" and "use early returns" in prose. Leave it; the new file is the pattern-matching surface, and the old file stays as philosophy.

## Layer 2b: The exemplar loop — cleaned code becomes the template

Takeaway: the hook and reviewer catch bad shape after it is written; this layer is what makes agents write good shape *first*, and it compounds as cleanup progresses.

Agents copy the nearest existing code. CoderAgent loads `reference_files`, OpenAgent looks for "nearby code patterns," and PatternAnalyst is built to find similar implementations. In codemem today that means replicating the structure of files carrying 29 shape warnings. Cleanup is only worth doing if the cleaned code becomes what agents copy next.

- **Reference-file rule** (add to CoderAgent Step 2, OpenAgent, PatternAnalyst): when a reference file has shape warnings, copy its API, naming, and error-handling conventions, but not its function structure. State this in the rule with the same bad/good framing as `code-shape.md`.
- **Exemplar list** in codemem `AGENTS.md`: as each package reaches `error`, list two or three files from it under "Reference implementations for code shape." TaskManager and PatternAnalyst prefer these when choosing `reference_files`.
- **Cleanup targets the worst first, and stays small.** Biome reports the measured value per function; sort descending and take the top 10 per package as one bead. Do not attempt "clean packages/viewer-server" as a unit. Boy-scout rule applies only inside functions the agent already created or owns for the task (see scope rule in 1b).
- Each cleanup PR should leave at least one function that reads as a clear before/after; those become the real examples in `code-shape.md`, replacing the synthetic ones over time.

## Layer 3: Hard-fail review before "done"

Takeaway: keep CoderAgent self-review, and use an independent reviewer with a single verdict for medium/high-risk work. The reviewer checks judgment calls, not linter output.

### 3a. Reviewer checklist

Add a "Code shape" block to `.opencode/agent/subagents/code/reviewer.md`, checked against the diff only:

- New opaque boolean literals at call sites or public APIs that need an options object
- Extraction that merely moves complexity into poorly named one-use helpers
- Functions whose internal section comments expose multiple responsibilities
- Any lint diagnostic that was suppressed (`biome-ignore`, `eslint-disable`, `noqa`) without a one-line reason
- Any touched code that became harder to test or reason about despite passing numeric thresholds

Output contract: reviewer ends with exactly `SHIP` or `REQUEST CHANGES` plus a list of `file:line — rule` items. The existing benchmark evaluator already requires this terminal verdict, so it stays consistent.

### 3b. Wiring

- OpenAgent: keep current risk routing during the pilot. Record reviewer invocations by risk class. If low-risk calls remain excessive, define narrow triggers: uncertain behavior, backward-compatibility risk, non-obvious concurrency/state changes, or a failed self-review. Style uncertainty alone is not a trigger once the hook is active.
- Reviewer permissions verified not shadowed: `reviewer.md` frontmatter has no `bash` key, global `agent.CodeReviewer.tools` disables only write/edit, global `permission.bash."*"` is `allow`, and the chezmoi-rendered copy matches the repo. No change needed there.
- OpenCoder: already delegates to CodeReviewer; add the checklist and the hard verdict.
- CoderAgent: self-review stays (it's cheap), but completion report must include the lint-clean check. It does not get to declare SHIP; that is the reviewer's job.
- On `REQUEST CHANGES`: loop back to the author agent with the item list, max 2 cycles, then escalate to the user.

### 3c. Optional: AdversarialReviewer for high-risk paths only

Not part of the default loop. Keep the medium/high routing that exists.

## Rollout order

1. codemem `biome.json`: three shape rules at `warn`, higher test threshold, one clean package at `error`. Baseline is already measured; no flag-day.
2. OpenCode `lint-feedback` pilot for codemem using count-based no-regression reporting in append mode. Test clean file, dirty legacy file, line-shifting edit, concurrent calls, and a fixed regression.
3. `code-shape.md` here + codemem `AGENTS.md` section.
4. Reviewer checklist + verdict wiring in `reviewer.md`, `openagent.md`, `opencoder.md`, `coder-agent.md`.
5. Claude Code paired pre/post hook after the OpenCode pilot proves the behavior.
6. Measure for two weeks. The goal is less churn, so measure churn, not just detection:
   - Re-edits of the same file after a hook message per session (target: trends toward 1; more than 2 means the message is not actionable enough)
   - `REQUEST CHANGES` items tagged as code-shape (target: trends toward 0 once the hook is live; if it does not, the hook is not being obeyed)
   - Lint regressions reported / fixed / ignored
   - CodeReviewer calls by risk class
   - Block only if append mode is ignored.
7. Cleanup beads, top-10-worst per package, starting with the smallest package. Add exemplar entries to codemem `AGENTS.md` as each package flips to `error`.

## Open questions for iteration

- Cognitive complexity threshold: start at Biome's default 15; consider 10 only after the ratchet produces good refactors rather than helper-function confetti.
- Should layer 2's five rules live in this repo's shared context (applies everywhere) or only in per-repo `AGENTS.md`? Recommend shared file + per-repo link, so other projects get it for free.
- Blocking vs append in the OpenCode hook. Append first.
- Should CoderAgent's bash deny be relaxed to allow `pnpm exec biome lint *` / `ruff check *` instead of building the plugin? Simpler, but leaks the "which linter" decision into every agent prompt. The plugin keeps that in one place.
- Test files: use a higher threshold (candidate: 100), not an exemption.

## Non-goals

- No ESLint migration for codemem.
- No formatting changes; Biome already handles that.
- No rewriting existing `code-quality.md` philosophy.
- No enforcement on generated files (`packages/viewer-server/static/`, `dist/`).
