import { createHash } from "node:crypto";
import { searchReferences } from "@/lib/references/catalog";
import type { ReferenceStatus } from "@/lib/references/types";

const ancestry = searchReferences("ancestry", "Kasatha")[0];
export const libraryEntry = {
  reference_id: ancestry.binding.id, catalog_version: ancestry.binding.catalogVersion,
  kind: "ancestry", name: ancestry.name, source_url: ancestry.sourceUrl, publication: "",
  revision: 7, appearance: "Four arms (user-entered fixture).",
  lore: "", trait_context: "", source_notes: "", updated_at: null,
};
export const librarySource: ReferenceStatus = {
  ...ancestry.binding, name: ancestry.name, kind: "ancestry", sourceUrl: ancestry.sourceUrl,
  coverage: "available", origin: "user-entered", revision: libraryEntry.revision, includedSections: ["appearance"],
  contextHash: createHash("sha256").update(`Appearance: ${libraryEntry.appearance}`).digest("hex"),
};
