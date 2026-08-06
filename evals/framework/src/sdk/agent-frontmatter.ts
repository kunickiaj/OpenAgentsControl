const VARIANT_PATTERN = /^[A-Za-z0-9_-]+$/;
const AGENT_MODES = new Set(['primary', 'subagent', 'all']);

function updateFrontmatterField(source: string, field: string, value: string): string {
  const lineEnding = source.startsWith('---\r\n') ? '\r\n' : '\n';
  const opening = `---${lineEnding}`;
  if (!source.startsWith(opening)) {
    throw new Error('Agent prompt is missing YAML frontmatter');
  }

  const closing = `${lineEnding}---`;
  const frontmatterEnd = source.indexOf(closing, opening.length);
  if (frontmatterEnd === -1) {
    throw new Error('Agent prompt has unterminated YAML frontmatter');
  }

  const frontmatter = source.slice(opening.length, frontmatterEnd);
  const lines = frontmatter.split(lineEnding);
  const fieldIndex = lines.findIndex(line => line.startsWith(`${field}:`));

  if (fieldIndex >= 0 && /^\w+:\s*[>|][+-]?\s*$/.test(lines[fieldIndex])) {
    throw new Error(`Agent prompt uses an unsupported multiline ${field} field`);
  }

  if (fieldIndex >= 0) {
    lines[fieldIndex] = `${field}: ${value}`;
  } else {
    lines.push(`${field}: ${value}`);
  }

  return `${opening}${lines.join(lineEnding)}${source.slice(frontmatterEnd)}`;
}

export function applyModelVariant(source: string, variant?: string): string {
  if (!variant) return source;
  if (!VARIANT_PATTERN.test(variant)) {
    throw new Error(`Invalid model variant: ${variant}`);
  }

  return updateFrontmatterField(source, 'variant', variant);
}

export function applyAgentMode(source: string, mode: string): string {
  if (!AGENT_MODES.has(mode)) {
    throw new Error(`Invalid agent mode: ${mode}`);
  }

  return updateFrontmatterField(source, 'mode', mode);
}
