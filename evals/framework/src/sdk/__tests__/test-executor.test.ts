import { describe, expect, it, vi } from 'vitest';
import { TestExecutor } from '../test-executor.js';
import type { TestCase } from '../test-case-schema.js';

describe('TestExecutor prompt routing', () => {
  it('sends the harness agent and configured variant instead of the test metadata agent', async () => {
    const sendPrompt = vi.fn().mockResolvedValue({ info: {}, parts: [] });
    const executor = new TestExecutor(
      { sendPrompt } as never,
      {} as never,
      {
        defaultTimeout: 30_000,
        projectPath: '/project',
        defaultModel: 'anthropic/claude-opus-5',
        defaultVariant: 'medium',
        executionAgent: 'Eval Runner',
        debug: false,
      },
      { log: vi.fn(), logEvent: vi.fn() }
    );
    const testCase: TestCase = {
      id: 'routing-test',
      name: 'Routing test',
      description: 'Routes through the dynamically configured harness',
      category: 'developer',
      prompt: 'Review the fixture.',
      agent: 'OpenAgent',
      approvalStrategy: { type: 'auto-approve' },
      behavior: { minToolCalls: 0 },
    };

    vi.spyOn(executor as never, 'sendPromptWithHybridDetection' as never)
      .mockResolvedValue(undefined as never);

    await (executor as unknown as {
      sendPrompts(testCase: TestCase, sessionId: string, errors: string[]): Promise<void>;
    }).sendPrompts(testCase, 'session-1', []);

    expect(sendPrompt).toHaveBeenCalledWith('session-1', {
      text: 'Review the fixture.',
      agent: 'Eval Runner',
      model: { providerID: 'anthropic', modelID: 'claude-opus-5' },
      variant: 'medium',
      directory: '/project',
    });
  });
});
