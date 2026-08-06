const VARIANT_PATTERN = /^[A-Za-z0-9_-]+$/;

export function applyModelVariant(source: string, variant?: string): string {
  if (!variant) return source;
  if (!VARIANT_PATTERN.test(variant)) {
    throw new Error(`Invalid model variant: ${variant}`);
  }
  if (!source.startsWith('---\n')) {
    throw new Error('Agent prompt is missing YAML frontmatter');
  }

  const frontmatterEnd = source.indexOf('\n---\n', 4);
  if (frontmatterEnd === -1) {
    throw new Error('Agent prompt has unterminated YAML frontmatter');
  }

  const frontmatter = source.slice(4, frontmatterEnd);
  const updatedFrontmatter = /^variant:/m.test(frontmatter)
    ? frontmatter.replace(/^variant:.*$/m, `variant: ${variant}`)
    : `${frontmatter}\nvariant: ${variant}`;

  return `---\n${updatedFrontmatter}${source.slice(frontmatterEnd)}`;
}
