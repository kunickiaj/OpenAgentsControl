/**
 * Unit tests for enhanced DelegationEvaluator
 * 
 * Tests the new complexity scoring and time estimation features
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
    it('should trigger delegation for high complexity even with < 4 files', async () => {
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
      
      // Should suggest delegation due to complexity (frontend + backend + tests)
      expect(result.metadata?.complexityScore).toBeGreaterThan(0);
      expect(result.metadata?.shouldDelegate).toBe(true);
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

    it('should trigger delegation when estimated time > 60 minutes', async () => {
      // 5 files with complexity should exceed 60 min threshold
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
      expect(result.metadata?.shouldDelegate).toBe(true);
    });
  });

  describe('Delegation Reasons', () => {
    it('should provide reasons for delegation requirement', async () => {
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
        {
          timestamp: 3000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file3.ts' },
          },
        },
        {
          timestamp: 4000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file4.ts' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      expect(result.metadata?.delegationReasons).toBeDefined();
      expect(result.metadata?.delegationReasons.length).toBeGreaterThan(0);
      expect(result.metadata?.delegationReasons.some((r: string) => r.includes('File count'))).toBe(true);
    });

    it('should indicate simple task when no delegation needed', async () => {
      const timeline: TimelineEvent[] = [
        {
          timestamp: 1000,
          type: 'tool_call',
          data: {
            tool: 'write',
            input: { filePath: 'file1.ts' },
          },
        },
      ];

      const result = await evaluator.evaluate(timeline, mockSessionInfo);
      
      expect(result.metadata?.delegationReasons).toContain('Task is simple enough for direct execution');
    });
  });

  describe('Multiple Criteria Integration', () => {
    it('should delegate when ANY criterion is met', async () => {
      // Test with 3 files but high complexity
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
      
      // Should delegate even though fileCount < 4, due to complexity
      expect(result.metadata?.fileCount).toBeLessThan(4);
      expect(result.metadata?.shouldDelegate).toBe(true);
    });
  });
});
