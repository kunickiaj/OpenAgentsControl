#!/usr/bin/env bun

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const files = {
  openagent: '.opencode/agent/core/openagent.md',
  opencoder: '.opencode/agent/core/opencoder.md',
  reviewer: '.opencode/agent/subagents/code/reviewer.md',
  coder: '.opencode/agent/subagents/code/coder-agent.md',
  taskManager: '.opencode/agent/subagents/core/task-manager.md',
  batchExecutor: '.opencode/agent/subagents/core/batch-executor.md',
  stageOrchestrator: '.opencode/agent/subagents/core/stage-orchestrator.md'
} as const

const contents = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, readFileSync(join(repoRoot, path), 'utf8')])
) as Record<keyof typeof files, string>

const failures: string[] = []

function requireText(file: keyof typeof files, text: string): void {
  if (!contents[file].includes(text)) failures.push(`${files[file]} must include: ${text}`)
}

function forbidPattern(file: keyof typeof files, pattern: RegExp, reason: string): void {
  if (pattern.test(contents[file])) failures.push(`${files[file]} ${reason}`)
}

requireText('openagent', 'one initial external review and one delta-focused correction re-review')
requireText('openagent', 'Existing external review of the same unit consumes the initial review slot')
requireText('opencoder', 'Correction edits do not create a new unit or reset the budget')
requireText('reviewer', 'inspect the delta and unresolved findings instead of restarting a broad review')
requireText('taskManager', 'Beads (`bd`) is the only durable task-state backend')
requireText('taskManager', 'Legacy `.tmp/tasks/**` records are read-only migration input')
requireText('coder', 'Do not close the bead unless the caller explicitly assigned verification ownership')
requireText('batchExecutor', 'Do not run external review')

for (const file of ['openagent', 'opencoder', 'coder', 'taskManager', 'batchExecutor', 'stageOrchestrator'] as const) {
  forbidPattern(file, /(?:task-cli\.ts|task-management\/router\.sh)/, 'must not call the legacy task CLI')
}

if (failures.length > 0) {
  console.error(`Workflow contract validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('OK: bounded review and Beads workflow contracts validated')
