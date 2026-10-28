import { z } from "zod";

export const referenceBindingSchema = z.object({
  id: z.string().max(120).regex(/^sf2e\.(ancestries|classes)\.Item\.[a-zA-Z0-9]{16}$/),
  catalogVersion: z.string().min(1).max(100).regex(/^[a-zA-Z0-9.-]+$/),
}).strict();
export const creatureTraitBindingSchema = referenceBindingSchema.extend({
  id: z.string().max(120).regex(/^sf2e\.creature-traits\.[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();
export const enemyReferenceSelectionsSchema = z.object({
  ancestry: referenceBindingSchema.nullable(),
  creatureTraits: z.array(creatureTraitBindingSchema).max(32).refine((values) => new Set(values.map((value) => value.id)).size === values.length, "Duplicate trait references."),
}).strict();
export type EnemyReferenceSelections = z.infer<typeof enemyReferenceSelectionsSchema>;

export const npcReferenceContextSchema = z.object({
  species: z.string().trim().max(120),
  ancestryReference: referenceBindingSchema.nullable().optional(),
}).strict();

export const referenceStatusesSchema = z.array(z.object({
  id: z.union([referenceBindingSchema.shape.id, creatureTraitBindingSchema.shape.id]),
  catalogVersion: referenceBindingSchema.shape.catalogVersion,
  name: z.string().min(1).max(160),
  kind: z.enum(["ancestry", "class", "creature_trait"]),
  sourceUrl: z.string().url().max(500).startsWith("https://github.com/foundryvtt/pf2e/"),
  coverage: z.enum(["available", "not-reviewed"]),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.literal("user-entered").optional(),
  revision: z.number().int().positive().optional(),
  includedSections: z.array(z.enum(["appearance", "lore", "traitContext"])).max(3).optional(),
}).strict().refine((source) => {
  if (!source.origin) return source.revision === undefined && source.includedSections === undefined;
  const sections = source.includedSections;
  if (!sections?.length || source.revision === undefined) return false;
  return source.coverage === "available" && new Set(sections).size === sections.length
    && sections.every((section) => source.kind === "ancestry"
      ? section === "appearance" || section === "lore"
      : source.kind === "creature_trait" && section === "traitContext");
}, "User-entered provenance requires a revision and applicable, unique included sections.")
  .refine((source) => source.kind === "creature_trait" ? source.id.startsWith("sf2e.creature-traits.")
    : source.id.startsWith(source.kind === "ancestry" ? "sf2e.ancestries." : "sf2e.classes."), "Reference identity does not match its kind.")).max(34);

export const referenceSearchResponseSchema = z.object({
  catalogVersion: referenceBindingSchema.shape.catalogVersion,
  results: z.array(z.object({
    binding: z.union([referenceBindingSchema, creatureTraitBindingSchema]),
    kind: z.enum(["ancestry", "class", "creature_trait"]),
    name: z.string().min(1).max(160),
    publication: z.string().max(240),
    sourceUrl: referenceStatusesSchema.element.shape.sourceUrl,
    preview: z.string().max(1000),
    coverage: z.enum(["available", "not-reviewed"]),
  })).max(20),
});

export const referenceContextPreviewSchema = z.object({
  sources: referenceStatusesSchema,
  promptCharacters: z.number().int().min(0).max(4000),
  availability: z.array(z.object({
    kind: z.enum(["ancestry", "class", "creature_trait"]),
    id: z.union([referenceBindingSchema.shape.id, creatureTraitBindingSchema.shape.id]).optional(),
    name: z.string().min(1).max(160).optional(),
    state: z.enum(["unbound", "disabled", "empty", "available"]),
  }).strict()).max(34),
}).strict();
