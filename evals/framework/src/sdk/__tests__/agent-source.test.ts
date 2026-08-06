import { describe, expect, it } from 'vitest';
import { verifyAgentSourceSha256 } from '../agent-source.js';

const SOURCE = 'authoritative prompt\n';
const SOURCE_SHA256 = 'e298f0fb15e68716133fe314074a5d70b6faa523bfbd18a04a5f9de517c1fdfe';

describe('verifyAgentSourceSha256', () => {
  it('accepts a matching digest', () => {
    expect(() => verifyAgentSourceSha256(SOURCE, SOURCE_SHA256)).not.toThrow();
  });

  it('rejects a mismatched digest', () => {
    expect(() => verifyAgentSourceSha256('changed prompt\n', SOURCE_SHA256)).toThrow(
      'External agent prompt digest mismatch'
    );
  });

  it('rejects malformed digests', () => {
    expect(() => verifyAgentSourceSha256(SOURCE, 'not-a-digest')).toThrow(
      'Invalid external agent SHA-256'
    );
  });
});
