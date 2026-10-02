import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

type AgentFrontmatter = {
  name: string;
  mode: string;
  permission: {
    edit: Record<string, string>;
    task: Record<string, string>;
    [key: string]: unknown;
  };
  permissions?: { action: string; resource: string; effect: string }[];
  tools?: Record<string, boolean>;
};

function loadAgent(filename: string): AgentFrontmatter {
  const source = readFileSync(
    new URL(`../../../../../.opencode/agent/subagents/code/${filename}.md`, import.meta.url),
    'utf8'
  );
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!frontmatter) throw new Error(`Missing YAML frontmatter: ${filename}`);
  return parseYaml(frontmatter[1]) as AgentFrontmatter;
}

describe.each([
  { name: 'CoderAgent', filename: 'coder-agent', delegates: ['contextscout', 'externalscout', 'TestEngineer'] },
  { name: 'TestEngineer', filename: 'test-engineer', delegates: ['contextscout', 'externalscout'] },
])('$name source permission contract', ({ name, filename, delegates }) => {
  it('preserves the named subagent identity', () => {
    // Arrange: read source YAML rather than an installed or copied role.
    const agent = loadAgent(filename);
    // Act
    const identity = { name: agent.name, mode: agent.mode };
    // Assert: neither renaming nor promotion to a primary agent is permitted.
    expect(identity).toEqual({ name, mode: 'subagent' });
  });

  it('inherits shell policy without legacy, modern, or tool overrides', () => {
    // Arrange
    const agent = loadAgent(filename);
    // Act: inspect declarations only; this does not model runtime matching.
    const legacyActions = Object.keys(agent.permission);
    const modernActions = (agent.permissions ?? []).map(rule => rule.action.split(':')[0]);
    const toolOverrides = Object.keys(agent.tools ?? {});
    // Assert: allow, ask, deny, enable, and disable are all local overrides.
    for (const action of ['*', 'bash', 'shell']) {
      expect(legacyActions).not.toContain(action);
      expect(modernActions).not.toContain(action);
      expect(toolOverrides).not.toContain(action);
    }
  });

  it('retains edit denials without adding an ordinary-source denial or allow override', () => {
    // Arrange
    const agent = loadAgent(filename);
    // Act
    const edits = agent.permission.edit;
    // Assert: exact declarations retain protections without a wildcard engine.
    expect(edits).toEqual({
      '**/*.env*': 'deny',
      '**/*.key': 'deny',
      '**/*.secret': 'deny',
      'node_modules/**': 'deny',
      '.git/**': 'deny',
    });
  });

  it('retains only the existing task delegates', () => {
    // Arrange
    const agent = loadAgent(filename);
    const expected = Object.fromEntries(delegates.map(delegate => [delegate, 'allow']));
    // Act
    const tasks = agent.permission.task;
    // Assert: missing delegates, extra delegates, and changed actions all fail.
    expect(tasks).toEqual(expected);
  });
});
