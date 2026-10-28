import { resolveReference } from "@/lib/references/catalog";
import type { ReferenceBinding, ReferenceKind } from "@/lib/references/types";

export const ancestryReferenceColumns = "ancestry_reference_id, ancestry_catalog_version";
export const characterReferenceColumns = `${ancestryReferenceColumns}, class_reference_id, class_catalog_version`;

export function referenceColumnValues(kind: ReferenceKind, binding: ReferenceBinding | null | undefined) {
  if (binding === undefined) return {};
  return kind === "ancestry"
    ? { ancestry_reference_id: binding?.id ?? null, ancestry_catalog_version: binding?.catalogVersion ?? null }
    : { class_reference_id: binding?.id ?? null, class_catalog_version: binding?.catalogVersion ?? null };
}

export function prepareReferenceSelection(
  kind: ReferenceKind,
  text: string,
  binding: ReferenceBinding | null | undefined,
  previous?: { text: string; binding: ReferenceBinding | null },
): ReferenceBinding | null | undefined {
  if (binding === undefined) {
    return previous && text !== previous.text ? null : undefined;
  }
  if (binding === null) return null;
  if (previous && text === previous.text && binding.id === previous.binding?.id && binding.catalogVersion === previous.binding.catalogVersion) {
    return binding;
  }
  resolveReference(binding, kind, text);
  return binding;
}
