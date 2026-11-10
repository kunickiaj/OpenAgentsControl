/**
 * DelegationEvaluator - Reports how the agent routed its work
 *
 * File count, estimated time, and complexity describe the size of a change.
 * They never require delegation: one agent that makes a large change keeps the
 * whole change in one context, so direct execution is a valid route at any size.
 *
 * A test that needs a specific route states it with `behavior.shouldDelegate`,
 * which BehaviorEvaluator enforces.
 */

import { BaseEvaluator } from './base-evaluator.js';
import {
  TimelineEvent,
  SessionInfo,
  EvaluationResult,
  Evidence,
  Check,
  DelegationCheck
} from '../types/index.js';

export class DelegationEvaluator extends BaseEvaluator {
  name = 'delegation';
  description = 'Reports routing evidence: change size and delegation calls';

  async evaluate(timeline: TimelineEvent[], sessionInfo: SessionInfo): Promise<EvaluationResult> {
    const evidence: Evidence[] = [];

    const fileModTools = this.getFileModificationTools(timeline);
    const fileCount = this.countAffectedFiles(fileModTools);
    const complexityScore = this.calculateComplexityScore(timeline, fileModTools);
    const estimatedMinutes = this.estimateTimeRequired(fileCount, complexityScore);

    // Keep both legacy task and current subagent events in timeline order.
    const delegationCalls = this.getDelegationTools(timeline);
    const didDelegate = delegationCalls.length > 0;

    delegationCalls.forEach((call, index) => {
      const input = call.data?.input || call.data?.state?.input || {};
      evidence.push(this.createEvidence(
        'task-tool-call',
        `Task tool call #${index + 1}: ${input.description || 'No description'}`,
        {
          subagent_type: input.agent || input.subagent_type,
          description: input.description,
          prompt: input.prompt,
          timestamp: call.timestamp
        }
      ));
    });

    const check: DelegationCheck = {
      didDelegate,
      fileCount,
      evidence: this.describeRoute(fileCount, delegationCalls.length)
    };
    const checks: Check[] = [{
      name: this.routeName(fileCount, didDelegate),
      passed: true,
      weight: 100,
      evidence: check.evidence.map(e =>
        this.createEvidence('delegation-check', e, { fileCount, didDelegate })
      )
    }];

    // Add general evidence
    evidence.push(
      this.createEvidence(
        'file-modifications',
        `${fileCount} files affected by this task`,
        {
          fileCount,
          files: this.getAffectedFilePaths(fileModTools)
        }
      )
    );

    if (delegationCalls.length > 0) {
      evidence.push(
        this.createEvidence(
          'delegation-calls',
          `${delegationCalls.length} delegation calls made`,
          {
            delegations: delegationCalls.map(call => {
              const input = call.data?.input || call.data?.state?.input || {};
              return {
                timestamp: call.timestamp,
                agent: input.agent || input.subagent_type,
                prompt: input.prompt?.substring(0, 100)
              };
            })
          }
        )
      );
    }

    return this.buildResult(this.name, checks, [], evidence, {
      fileCount,
      complexityScore,
      estimatedMinutes,
      didDelegate,
      delegationCheck: check
    });
  }

  private routeName(fileCount: number, didDelegate: boolean): string {
    if (fileCount === 0) return 'no-file-modifications';
    return didDelegate ? 'delegated-execution' : 'direct-execution';
  }

  private describeRoute(fileCount: number, delegationCount: number): string[] {
    if (fileCount === 0) return ['No files were modified in this session'];
    const route = delegationCount > 0
      ? `Delegation calls: ${delegationCount}`
      : 'Executed directly without delegation';
    return [`Files affected: ${fileCount}`, route];
  }

  /**
   * Get file modification tool calls (write, edit)
   */
  private getFileModificationTools(timeline: TimelineEvent[]): TimelineEvent[] {
    return this.getToolCalls(timeline).filter(event =>
      event.data?.tool === 'write' || event.data?.tool === 'edit'
    );
  }

  /**
   * Get affected file paths from tool calls
   */
  private getAffectedFilePaths(toolCalls: TimelineEvent[]): string[] {
    const files = new Set<string>();
    
    for (const call of toolCalls) {
      const input = call.data?.input;
      if (input?.filePath) {
        files.add(input.filePath);
      }
      if (input?.path) {
        files.add(input.path);
      }
    }

    return Array.from(files);
  }

  /**
   * Calculate complexity score based on multiple factors
   * 
   * Factors:
   * - Number of different file types
   * - Number of different directories
   * - Presence of test files
   * - Presence of configuration files
   * - Multiple module types (frontend + backend)
   */
  private calculateComplexityScore(timeline: TimelineEvent[], fileModTools: TimelineEvent[]): number {
    let score = 0;
    const filePaths = this.getAffectedFilePaths(fileModTools);
    
    if (filePaths.length === 0) return 0;

    // Factor 1: Multiple file types (+2 per unique extension beyond first)
    const extensions = new Set(filePaths.map(f => {
      const match = f.match(/\.([^.]+)$/);
      return match ? match[1] : '';
    }).filter(Boolean));
    score += Math.max(0, (extensions.size - 1) * 2);

    // Factor 2: Multiple directories (+1 per unique directory beyond first)
    const directories = new Set(filePaths.map(f => {
      const parts = f.split('/');
      return parts.slice(0, -1).join('/');
    }).filter(Boolean));
    score += Math.max(0, (directories.size - 1));

    // Factor 3: Test files present (+3)
    const hasTests = filePaths.some(f => 
      f.includes('/test/') || 
      f.includes('/tests/') || 
      f.includes('.test.') || 
      f.includes('.spec.')
    );
    if (hasTests) score += 3;

    // Factor 4: Configuration files (+2)
    const hasConfig = filePaths.some(f =>
      f.includes('config') ||
      f.includes('.json') ||
      f.includes('.yaml') ||
      f.includes('.yml')
    );
    if (hasConfig) score += 2;

    // Factor 5: Multiple module types (+4)
    const hasFrontend = filePaths.some(f => 
      f.includes('/components/') ||
      f.includes('/pages/') ||
      f.includes('/ui/')
    );
    const hasBackend = filePaths.some(f =>
      f.includes('/api/') ||
      f.includes('/server/') ||
      f.includes('/services/')
    );
    if (hasFrontend && hasBackend) score += 4;

    // Factor 6: Read operations suggest research needed (+1 per 3 reads)
    const readCalls = this.getToolCallsByName(timeline, 'read');
    score += Math.floor(readCalls.length / 3);

    return score;
  }

  /**
   * Estimate time required in minutes
   * 
   * Base estimates:
   * - 15 minutes per file
   * - +5 minutes per complexity point
   * - Minimum 10 minutes
   */
  private estimateTimeRequired(fileCount: number, complexityScore: number): number {
    const baseTime = fileCount * 15; // 15 min per file
    const complexityTime = complexityScore * 5; // 5 min per complexity point
    const total = baseTime + complexityTime;
    
    return Math.max(10, total); // Minimum 10 minutes
  }

}
