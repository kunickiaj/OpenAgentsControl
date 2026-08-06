import { describe, expect, it } from 'vitest';
import { applyAgentMode, applyModelVariant } from '../agent-frontmatter.js';

const prompt = `---
description: Reviewer
mode: subagent
---

# Reviewer
`;

describe('applyModelVariant', () => {
  it('adds a variant to agent frontmatter', () => {
    expect(applyModelVariant(prompt, 'medium')).toContain(
      'mode: subagent\nvariant: medium\n---'
    );
  });

  it('replaces an existing variant', () => {
    const existing = prompt.replace('mode: subagent', 'mode: subagent\nvariant: low');
    expect(applyModelVariant(existing, 'high')).toContain('variant: high');
    expect(applyModelVariant(existing, 'high')).not.toContain('variant: low');
  });

  it('returns the prompt unchanged without a variant', () => {
    expect(applyModelVariant(prompt)).toBe(prompt);
  });

  it('rejects unsafe variant values', () => {
    expect(() => applyModelVariant(prompt, 'high\npermission: allow')).toThrow(
      'Invalid model variant'
    );
  });

  it('rejects prompts without frontmatter', () => {
    expect(() => applyModelVariant('# Reviewer', 'high')).toThrow(
      'Agent prompt is missing YAML frontmatter'
    );
  });

  it('rejects unterminated frontmatter', () => {
    expect(() => applyModelVariant('---\nmode: subagent', 'high')).toThrow(
      'Agent prompt has unterminated YAML frontmatter'
    );
  });
});

describe('applyAgentMode', () => {
  it('adds a mode when the source does not define one', () => {
    const source = prompt.replace('mode: subagent\n', '');

    expect(applyAgentMode(source, 'primary')).toContain(
      'description: Reviewer\nmode: primary\n---'
    );
  });

  it('replaces an existing mode', () => {
    expect(applyAgentMode(prompt, 'primary')).toContain('mode: primary');
    expect(applyAgentMode(prompt, 'primary')).not.toContain('mode: subagent');
  });

  it('rejects unsupported modes', () => {
    expect(() => applyAgentMode(prompt, 'reviewer')).toThrow('Invalid agent mode');
  });

  it('handles CRLF frontmatter', () => {
    const crlf = prompt.split('\n').join('\r\n');

    expect(applyAgentMode(crlf, 'primary')).toContain('mode: primary\r\n---');
  });

  it('handles a closing delimiter at end of file', () => {
    expect(applyAgentMode('---\nmode: subagent\n---', 'primary')).toContain(
      'mode: primary\n---'
    );
  });

  it('preserves the prompt body', () => {
    expect(applyAgentMode(prompt, 'primary')).toContain('# Reviewer');
  });

  it('rejects multiline mode fields instead of corrupting frontmatter', () => {
    const multiline = prompt.replace('mode: subagent', 'mode: >\n  subagent');

    expect(() => applyAgentMode(multiline, 'primary')).toThrow(
      'unsupported multiline mode field'
    );
  });
});
