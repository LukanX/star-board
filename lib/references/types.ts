export type ReferenceKind = "ancestry" | "class";
export type ReferenceBinding = { id: string; catalogVersion: string };
export type ReferenceStatus = {
  id: string;
  catalogVersion: string;
  name: string;
  kind: ReferenceKind | "creature_trait";
  sourceUrl: string;
  coverage: "available" | "not-reviewed";
  contextHash: string;
  origin?: "user-entered";
  revision?: number;
  includedSections?: Array<"appearance" | "lore" | "traitContext">;
};
export type ReferenceCandidate = {
  binding: ReferenceBinding;
  kind: ReferenceKind | "creature_trait";
  name: string;
  publication: string;
  sourceUrl: string;
  preview: string;
  coverage: "available" | "not-reviewed";
};
export type ReferenceContext = { text: string; sources: ReferenceStatus[] };
export type ReferenceAvailability = {
  kind: ReferenceStatus["kind"];
  id?: string;
  name?: string;
  state: "unbound" | "disabled" | "empty" | "available";
};
export type NpcReferenceContext = { species: string; ancestryReference?: ReferenceBinding | null };
export type EnemyReferenceContext = { ancestryReference?: ReferenceBinding | null };

export type ReferenceColumns = {
  ancestry_reference_id?: string | null;
  ancestry_catalog_version?: string | null;
  class_reference_id?: string | null;
  class_catalog_version?: string | null;
};

export function readReferenceBinding(record: ReferenceColumns, kind: ReferenceKind): ReferenceBinding | null {
  const id = kind === "ancestry" ? record.ancestry_reference_id : record.class_reference_id;
  const catalogVersion = kind === "ancestry" ? record.ancestry_catalog_version : record.class_catalog_version;
  return id && catalogVersion ? { id, catalogVersion } : null;
}

export function referenceMatchesText(binding: ReferenceBinding | null | undefined, text: string, previousText: string) {
  return text.trim().toLowerCase() === previousText.trim().toLowerCase() ? binding ?? null : null;
}
