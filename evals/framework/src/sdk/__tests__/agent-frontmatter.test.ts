import { describe, expect, it } from 'vitest';
import { applyModelVariant } from '../agent-frontmatter.js';

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
