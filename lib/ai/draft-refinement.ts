export function mergeProtectedDraftFields<T extends Record<string, unknown>>(
  draft: T,
  currentDraft: Record<string, unknown> | undefined,
  protectedFields: readonly string[] = [],
): T {
  if (!currentDraft || !protectedFields.length) return draft;

  const merged: Record<string, unknown> = { ...draft };
  for (const field of protectedFields) {
    if (Object.prototype.hasOwnProperty.call(currentDraft, field)) {
      merged[field] = currentDraft[field];
    }
  }

  return merged as T;
}