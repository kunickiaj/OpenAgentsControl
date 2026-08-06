type Cursor = { lastApplied: string | null };

declare function loadCursor(scopeId: string): Cursor | undefined;
declare function deleteCursor(scopeId: string): void;
declare function hasLocalRows(scopeId: string): boolean;
declare function bootstrapScope(scopeId: string): Promise<void>;
declare function requestOps(scopeId: string, since: string | null): Promise<void>;

export function handleResetRequired(scopeId: string): void {
  deleteCursor(scopeId);
}

export async function syncScope(scopeId: string): Promise<void> {
  const lastApplied = loadCursor(scopeId)?.lastApplied ?? null;
  const localRowsPresent = hasLocalRows(scopeId);

  if (lastApplied === null && !localRowsPresent) {
    await bootstrapScope(scopeId);
    return;
  }

  await requestOps(scopeId, lastApplied);
}

export function shouldRequireReset(
  since: string | null,
  retainedFloor: string
): boolean {
  return since !== null && since < retainedFloor;
}
