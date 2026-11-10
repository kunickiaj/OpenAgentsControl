/**
 * Unit tests for DelegationEvaluator
 *
 * The evaluator reports change size and delegation calls. Size never makes
 * delegation a requirement, so every route passes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DelegationEvaluator } from '../delegation-evaluator.js';
import type { TimelineEvent, SessionInfo } from '../../types/index.js';

describe('DelegationEvaluator - Enhanced Features', () => {
  let evaluator: DelegationEvaluator;
  let mockSessionInfo: SessionInfo;

  beforeEach(() => {
    evaluator = new DelegationEvaluator();
    mockSessionInfo = {
      id: 'test-session',
      version: '1.0',
      title: 'Test Session',
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    };
  });

  describe('Delegation Tool Compatibility', () => {
    // Keep legacy events while accepting the current tool and agent argument.
    const delegationEvents = [
      { label: 'legacy task', data: { tool: 'task', input: { subagent_type: 'ContextScout' } } },
      { label: 'task with modern agent', data: { tool: 'task', input: { agent: 'ContextScout' } } },
      { label: 'modern subagent', data: { tool: 'subagent', input: { agent: 'ContextScout' } } },
      { label: 'subagent with legacy agent', data: { tool: 'subagent', input: { subagent_type: 'ContextScout' } } },
      { label: 'nested task', data: { state: { tool: 'task', input: { subagent_type: 'ContextScout' } } } },
      { label: 'nested subagent', data: { state: { tool: 'subagent', input: { agent: 'ContextScout' } } } },
    ];

    it.each(delegationEvents)('recognizes $label and reports the delegated agent', async ({ data }) => {
      // Arrange
      const timeline: TimelineEvent[] = [{ timestamp: 1000, type: 'tool_call', data }];

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.metadata?.didDelegate).toBe(true);
      expect(result.evidence).toContainEqual(expect.objectContaining({
        type: 'delegation-calls',
        data: expect.objectContaining({
          delegations: [expect.objectContaining({ agent: 'ContextScout', timestamp: 1000 })],
        }),
      }));
    });

    it.each(['flat', 'nested'])('prefers current agent consistently across %s delegation evidence', async shape => {
      // Arrange - Conflicting legacy input must not override the current agent.
      const input = { agent: 'ContextScout', subagent_type: 'CoderAgent' };
      const call = { tool: 'subagent', input };
      const data = shape === 'nested' ? { state: call } : call;
      const timeline: TimelineEvent[] = [{ timestamp: 1000, type: 'tool_call', data }];

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.evidence).toContainEqual(expect.objectContaining({
        type: 'delegation-calls',
        data: expect.objectContaining({
          delegations: [expect.objectContaining({ agent: 'ContextScout' })],
        }),
      }));
      expect(result.evidence).toContainEqual(expect.objectContaining({
        type: 'task-tool-call',
        data: expect.objectContaining({ subagent_type: 'ContextScout' }),
      }));
    });

    it.each(['read', 'task_status'])('does not mistake %s with an agent argument for delegation', async tool => {
      // Arrange
      const timeline: TimelineEvent[] = [{
        timestamp: 1000,
        type: 'tool_call',
        data: { tool, input: { agent: 'ContextScout' } },
      }];

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.metadata?.didDelegate).toBe(false);
      expect(result.evidence.some(evidence => evidence.type === 'delegation-calls')).toBe(false);
    });

    it('does not treat a non-tool event mentioning subagent as delegation', async () => {
      // Arrange
      const timeline: TimelineEvent[] = [{
        timestamp: 1000,
        type: 'assistant_message',
        data: { tool: 'subagent', input: { agent: 'ContextScout' }, text: 'A subagent is not needed.' },
      }];

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.metadata?.didDelegate).toBe(false);
    });
  });

  describe('Complexity Scoring', () => {
    it('scores a high-complexity direct change without requiring delegation', async () => {
      // 3 files but high complexity (multiple types, dirs, tests, config)
      const timeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/components/Button.tsx' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/api/users.ts' },
          },
        },
        {
          timestamp: 3000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'tests/Button.test.tsx' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      // Frontend + backend + tests raise the score; the direct route still passes.
      expect(result.metadata?.complexityScore).toBeGreaterThan(0);
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('should calculate higher complexity for multiple file types', async () => {
      const timeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/index.ts' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/styles.css' },
          },
        },
        {
          timestamp: 3000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'config.json' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      expect(result.metadata?.complexityScore).toBeGreaterThan(2); // Multiple extensions + config
    });

    it('should add complexity for test files', async () => {
      const withTests: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/utils.ts' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'tests/utils.test.ts' },
          },
        },
      ];

      const withoutTests: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/utils.ts' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/helpers.ts' },
          },
        },
      ];

      const resultWith = await evaluator.evaluate(withTests, mockSessionInfo);
      const resultWithout = await evaluator.evaluate(withoutTests, mockSessionInfo);
      
      expect(resultWith.metadata?.complexityScore).toBeGreaterThan(
        resultWithout.metadata?.complexityScore
      );
    });

    it('should add complexity for frontend + backend combination', async () => {
      const timeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/components/Header.tsx' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/api/auth.ts' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      expect(result.metadata?.complexityScore).toBeGreaterThan(3); // Should get +4 for frontend+backend
    });
  });

  describe('Time Estimation', () => {
    it('should estimate time based on file count', async () => {
      const timeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file1.ts' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file2.ts' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      // 2 files * 15 min = 30 min base
      expect(result.metadata?.estimatedMinutes).toBeGreaterThanOrEqual(30);
    });

    it('should add time for complexity', async () => {
      const simpleTimeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file1.ts' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file2.ts' },
          },
        },
      ];

      const complexTimeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/components/Button.tsx' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/api/users.ts' },
          },
        },
      ];

      const simpleResult = await evaluator.evaluate(simpleTimeline, mockSessionInfo);
      const complexResult = await evaluator.evaluate(complexTimeline, mockSessionInfo);
      
      expect(complexResult.metadata?.estimatedMinutes).toBeGreaterThan(
        simpleResult.metadata?.estimatedMinutes
      );
    });

    it('estimates over an hour for a five-file change without requiring delegation', async () => {
      const timeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/components/Button.tsx' },
          },
        },
        {
          timestamp: 2000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/components/Input.tsx' },
          },
        },
        {
          timestamp: 3000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'src/api/users.ts' },
          },
        },
        {
          timestamp: 4000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'tests/Button.test.tsx' },
          },
        },
        {
          timestamp: 5000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'config.json' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      expect(result.metadata?.estimatedMinutes).toBeGreaterThanOrEqual(60);
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
    });
  });

  describe('Routing', () => {
    const writeFiles = (count: number): TimelineEvent[] =>
      Array.from({ length: count }, (_, index) => ({
        timestamp: 1000 * (index + 1),
        type: 'tool_call' as const,
        data: { tool: 'write', input: { filePath: `file${index + 1}.ts` } },
      }));

    it.each([1, 4, 12])('passes a direct change to %i file(s)', async fileCount => {
      // Arrange
      const timeline = writeFiles(fileCount);

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.metadata?.fileCount).toBe(fileCount);
      expect(result.metadata?.delegationCheck.evidence).toContain('Executed directly without delegation');
    });

    it('records a delegated change without scoring it differently', async () => {
      // Arrange
      const timeline: TimelineEvent[] = [
        ...writeFiles(2),
        { timestamp: 9000, type: 'tool_call', data: { tool: 'subagent', input: { agent: 'CodeReviewer' } } },
      ];

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.metadata?.didDelegate).toBe(true);
      expect(result.metadata?.delegationCheck.evidence).toContain('Delegation calls: 1');
    });

    it('reports no route when nothing was modified', async () => {
      // Arrange
      const timeline: TimelineEvent[] = [
        { timestamp: 1000, type: 'tool_call', data: { tool: 'read', input: { filePath: 'file1.ts' } } },
      ];

      // Act
      const result = await evaluator.evaluate(timeline, mockSessionInfo);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.metadata?.delegationCheck.evidence).toEqual(['No files were modified in this session']);
    });
  });
});
