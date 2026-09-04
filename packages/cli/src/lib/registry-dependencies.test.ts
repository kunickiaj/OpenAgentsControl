import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { RegistrySchema, listComponents, readRegistry, resolveInstallPlan } from './registry.js';

const entry = (type: string, id: string, dependencies: string[] = []) => ({
  id,
  name: id,
  type,
  path: `.opencode/${type}/${id}.md`,
  description: id,
  dependencies,
});

const registry = (overrides: Record<string, unknown[]>) => RegistrySchema.parse({
  version: '1',
  components: {
    agents: [],
    subagents: [],
    commands: [],
    tools: [],
    plugins: [],
    skills: [],
    contexts: [],
    config: [],
    ...overrides,
  },
});

describe('registry dependency installation', () => {
  test('orders dependencies before their consumer and deduplicates shared entries', () => {
    const source = registry({
      agents: [entry('agent', 'root', ['subagent:helper', 'context:standard'])],
      subagents: [entry('subagent', 'helper', ['context:standard'])],
      contexts: [entry('context', 'standard')],
    });

    expect(resolveInstallPlan(source, 'agent:root').map(component => component.id)).toEqual([
      'standard',
      'helper',
      'root',
    ]);
  });

  test('rejects missing dependencies with the requiring component', () => {
    const source = registry({ agents: [entry('agent', 'root', ['context:missing'])] });

    expect(() => resolveInstallPlan(source, 'agent:root')).toThrow(
      "Component 'context:missing' required by 'agent:root' not found",
    );
  });

  test('installs each component once when dependencies form a cycle', () => {
    const source = registry({
      contexts: [
        entry('context', 'first', ['context:second']),
        entry('context', 'second', ['context:first']),
      ],
    });

    expect(resolveInstallPlan(source, 'context:first').map(component => component.id)).toEqual([
      'second',
      'first',
    ]);
  });

  test('expands context wildcard dependencies', () => {
    const source = registry({
      agents: [entry('agent', 'root', ['context:core/group/*'])],
      contexts: [
        { ...entry('context', 'first'), path: '.opencode/context/core/group/first.md' },
        { ...entry('context', 'second'), path: '.opencode/context/core/group/second.md' },
      ],
    });

    expect(resolveInstallPlan(source, 'agent:root').map(component => component.id)).toEqual([
      'first',
      'second',
      'root',
    ]);
  });

  test('resolves every installable component in the bundled registry', async () => {
    const packageRoot = path.resolve(import.meta.dir, '../../../..');
    const source = await readRegistry(packageRoot);

    expect(() => {
      for (const component of listComponents(source)) {
        resolveInstallPlan(source, `${component.type}:${component.id}`);
      }
    }).not.toThrow();
  });
});
