import { createHash } from 'crypto';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function verifyAgentSourceSha256(
  source: string,
  expectedSha256?: string,
  sourcePath = 'external agent prompt'
): void {
  if (!expectedSha256) return;
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error(`Invalid external agent SHA-256: ${expectedSha256}`);
  }

  const actualSha256 = createHash('sha256').update(source, 'utf8').digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `External agent prompt digest mismatch: ${sourcePath}\n` +
      `Expected: ${expectedSha256}\n` +
      `Actual:   ${actualSha256}`
    );
  }
}
