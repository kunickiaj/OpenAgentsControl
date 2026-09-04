# OpenCode Plugins

This directory contains local OpenCode plugins. The lint-feedback plugin is a pilot that adds no-regression Biome feedback after source edits; the existing agent validator tracks agent workflow behavior.

## Lint-feedback pilot

The pilot is inert unless a trusted wrapper passes an explicit command array. For example, manage this wrapper in your user-level OpenCode plugin directory and load it as a normal string plugin entry:

```json
{
  "plugin": ["file:///absolute/path/to/lint-feedback-wrapper.ts"]
}
```

```ts
import { LintFeedbackPlugin } from "/absolute/path/to/lint-feedback-core"

export default ((input) => LintFeedbackPlugin(input, {
  command: ["pnpm", "exec", "biome", "lint", "--reporter=json"],
  timeoutMs: 10000,
})) satisfies typeof LintFeedbackPlugin
```

Keep the wrapper in trusted user configuration rather than accepting an executable command from each worktree. The imported checkout must have the plugin dependencies installed.

The plugin appends `--` and the touched worktree-relative file to the command, then starts it without a shell in the worktree. It never discovers or invokes repository scripts.

Paired `tool.execute.before` and `tool.execute.after` hooks cover `edit`, `write`, and `apply_patch`, including destinations moved from non-source paths. They compare diagnostics by category, report only new or worsened findings, and cap feedback at 10 diagnostics. Complexity and function-length rules match nearest locations before comparing measured values; count-only rules match description, source text when available, and nearest location.

Limits:
- Only JavaScript and TypeScript source extensions are checked.
- Invalid paths, paths outside the worktree, non-source files, and deleted files are ignored.
- Spawn, timeout, and JSON parse failures preserve the edit and add one short warning per session. Timeouts reject immediately, then terminate the process group on POSIX or use Windows `taskkill /T /F` when available.
- Identical count-only source expressions and large location shifts can still make matching ambiguous.
- Claude hooks are deferred until the OpenCode pilot is measured.

Restart OpenCode after installing or changing the plugin because plugins load at startup.

## Agent validator

## Features

- ✅ Tracks tool usage in real-time
- ✅ Validates approval gate enforcement
- ✅ Checks lazy context loading
- ✅ Analyzes delegation decisions (4+ file rule)
- ✅ Detects critical rule violations (auto-fix attempts)

## Available Tools

### `validate_session`
Validate the current agent session against defined rules.

```bash
validate_session
```

**Options:**
- `include_details` (boolean, optional) - Include detailed evidence for each check

**Returns:** Validation report with compliance score

---

### `check_approval_gates`
Check if approval gates were properly enforced before execution operations.

```bash
check_approval_gates
```

**Returns:** Approval gate compliance status

---

### `export_validation_report`
Export a comprehensive validation report to a markdown file.

```bash
export_validation_report
```

**Options:**
- `output_path` (string, optional) - Path to save the report (defaults to `.tmp/validation-{sessionID}.md`)

**Returns:** Path to exported report + summary

---

### `analyze_delegation`
Analyze whether delegation decisions followed the 4+ file rule.

```bash
analyze_delegation
```

**Returns:** Delegation analysis with file count statistics

---

## Validation Rules

The plugin checks for:

1. **approval_gate_enforcement** - Did agent request approval before bash/write/edit/task?
2. **stop_on_failure** - Did agent stop on errors or try to auto-fix?
3. **lazy_context_loading** - Did agent only load context files when needed?
4. **delegation_appropriateness** - Did agent delegate when 4+ files involved?
5. **tool_usage** - Track all tool calls for analysis

## Usage Examples

### Basic Validation
```
You: "Create a new API endpoint"
[Agent works on task]
You: "validate_session"
```

### Check Approval Compliance
```
You: "Run the tests"
Agent: "Approval needed before proceeding."
You: "Approved. Also check_approval_gates"
```

### Export Report
```
You: "We just finished refactoring. Export validation report"
Agent: [Exports to .tmp/validation-{id}.md]
```

## Installation

The plugin auto-loads from `.opencode/plugins/` when OpenCode starts.

**Install dependencies:**
```bash
cd .opencode/plugins
npm install
# or
bun install
```

## How It Works

1. **Event Tracking** - Hooks into OpenCode SDK events:
   - `session.message.created`
   - `tool.execute.before`
   - `tool.execute.after`

2. **Behavior Analysis** - Analyzes messages for:
   - Tool invocations
   - Approval language
   - Context file reads
   - Delegation patterns

3. **Validation** - Compares actual behavior against OpenAgent rules

4. **Reporting** - Generates compliance reports with scores and evidence

## Compliance Scoring

- **100%** - Perfect compliance
- **90-99%** - Excellent (minor warnings)
- **80-89%** - Good (some warnings)
- **70-79%** - Fair (multiple warnings)
- **<70%** - Needs improvement (errors or many warnings)

## Troubleshooting

### "No execution operations tracked"
- Plugin just loaded, no prior tracking
- Run a task first, then validate

### "Error fetching session"
- Check OpenCode SDK connection
- Verify session ID is valid

### False positives on approval gates
- Agent may use different approval phrasing
- Check `approvalKeywords` in plugin code
- Add custom patterns if needed

## Customization

Edit `agent-validator.ts` to:
- Add custom validation rules
- Modify approval detection patterns
- Adjust delegation thresholds
- Change severity levels

## Next Steps

1. Test with simple sessions
2. Identify false positives/negatives
3. Refine validation logic
4. Add project-specific rules
5. Integrate into OpenAgent workflow
