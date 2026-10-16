#!/usr/bin/env bun

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const files = {
  openagent: '.opencode/agent/core/openagent.md',
  opencoder: '.opencode/agent/core/opencoder.md',
  reviewer: '.opencode/agent/subagents/code/reviewer.md',
  adversarialReviewer: '.opencode/agent/subagents/code/adversarial-reviewer.md',
  codeReviewWorkflow: '.opencode/context/core/workflows/code-review.md',
  delegationSpecialists: '.opencode/context/core/workflows/task-delegation-specialists.md',
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

function validateReviewerPermissions(file: 'reviewer' | 'adversarialReviewer'): void {
  const frontmatter = contents[file].match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    failures.push(`${files[file]} must have YAML frontmatter`)
    return
  }

  const metadata = Bun.YAML.parse(frontmatter[1]) as Record<string, unknown>
  // Legacy name can make the runtime treat native permissions as request data.
  for (const key of ['name', 'temperature', 'permission', 'tools']) {
    if (key in metadata) failures.push(`${files[file]} must not set legacy ${key}`)
  }

  // Ordered V2 rules deny edits/delegation without replacing inherited shell rules.
  const expected = [
    { action: 'edit', resource: '*', effect: 'deny' },
    { action: 'subagent', resource: '*', effect: 'deny' }
  ]
  const permissions = metadata.permissions
  const scoutResources = new Set(['ContextScout', 'contextscout', 'subagents/core/contextscout'])
  const matches = Array.isArray(permissions) &&
    (file === 'reviewer' ? permissions.length > 2 : permissions.length === 2) &&
    expected.every((rule, index) => {
      const actual = permissions[index]
      return actual && Object.keys(actual).length === 3 &&
        actual.action === rule.action && actual.resource === rule.resource && actual.effect === rule.effect
    }) && permissions.slice(2).every(rule => {
      return rule && Object.keys(rule).length === 3 && rule.action === 'subagent' &&
        scoutResources.has(rule.resource) && rule.effect === 'allow'
    })
  if (!matches) {
    failures.push(`${files[file]} must deny all edits and subagents, allow only CodeReviewer's ContextScout exception, and inherit shell permissions`)
  }
}

requireText('openagent', 'one initial external review and one delta-focused correction re-review')
requireText('openagent', 'Existing external review of the same unit consumes the initial review slot')
requireText('opencoder', 'Correction edits do not create a new unit or reset the budget')
requireText('reviewer', 'inspect the delta and unresolved findings instead of restarting a broad review')
requireText('taskManager', 'Beads (`bd`) is the only durable task-state backend')
requireText('taskManager', 'Legacy `.tmp/tasks/**` records are read-only migration input')
requireText('coder', 'Do not close the bead unless the caller explicitly assigned verification ownership')
requireText('batchExecutor', 'Do not run external review')

for (const file of ['reviewer', 'adversarialReviewer'] as const) {
  validateReviewerPermissions(file)
}

for (const file of ['codeReviewWorkflow', 'delegationSpecialists'] as const) {
  requireText(file, 'only for a named concern')
  requireText(file, 'not a routine second general review')
  forbidPattern(file, /meaningful risk boundary or/, 'must not route adversarial review from risk alone')
}

for (const file of ['openagent', 'opencoder', 'coder', 'taskManager', 'batchExecutor', 'stageOrchestrator'] as const) {
  forbidPattern(file, /(?:task-cli\.ts|task-management\/router\.sh)/, 'must not call the legacy task CLI')
}

if (failures.length > 0) {
  console.error(`Workflow contract validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('OK: bounded review and Beads workflow contracts validated')
