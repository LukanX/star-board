import { z } from "zod";
import { parseAonCreatureUrl } from "@/lib/enemies/aon-url";

const shortText = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => shortText(max).nullable();
const boundedModifier = z.number().int().min(-50).max(50);

export const enemySizeSchema = z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
export const enemyRaritySchema = z.enum(["common", "uncommon", "rare", "unique"]);
export const enemyOriginSchema = z.enum(["manual", "ai", "aon"]);

const traitListSchema = z.array(shortText(48).min(1)).max(32).superRefine((traits, context) => {
  const normalized = traits.map((trait) => trait.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: "custom", message: "Enemy traits must be unique." });
  }
});

const recallKnowledgeSchema = z.object({
  dc: z.number().int().min(0).max(60),
  entries: z.array(z.object({
    trait: shortText(80).min(1),
    skill: shortText(80).min(1),
  })).max(12),
  adjustmentNote: shortText(800),
});

const senseSchema = z.object({
  name: shortText(120).min(1),
  range: nullableText(80),
  notes: shortText(400),
});

const perceptionSchema = z.object({
  modifier: boundedModifier,
  senses: z.array(senseSchema).max(24),
  notes: shortText(800),
});

const languagesSchema = z.object({
  names: z.array(shortText(80).min(1)).max(32),
  additionalCount: z.number().int().min(0).max(99),
  communicationNotes: shortText(800),
});

const skillSchema = z.object({
  name: shortText(120).min(1),
  modifier: boundedModifier,
  notes: shortText(400),
});

const abilityModifiersSchema = z.object({
  strength: boundedModifier,
  dexterity: boundedModifier,
  constitution: boundedModifier,
  intelligence: boundedModifier,
  wisdom: boundedModifier,
  charisma: boundedModifier,
});

const defenseSaveSchema = z.object({
  modifier: boundedModifier,
  notes: shortText(400),
});

const defenseEntrySchema = z.object({
  label: shortText(80).min(1),
  value: z.number().int().min(0).max(9999),
  notes: shortText(400),
});

const defensesSchema = z.object({
  armorClass: z.number().int().min(0).max(80),
  armorClassNotes: shortText(800),
  saves: z.object({
    fortitude: defenseSaveSchema,
    reflex: defenseSaveSchema,
    will: defenseSaveSchema,
  }),
  hitPoints: z.array(defenseEntrySchema).max(12),
  immunities: z.array(shortText(120).min(1)).max(32),
  resistances: z.array(shortText(160).min(1)).max(32),
  weaknesses: z.array(shortText(160).min(1)).max(32),
  notes: shortText(800),
});

const movementSchema = z.object({
  mode: shortText(80).min(1),
  speed: shortText(80).min(1),
  notes: shortText(400),
});

const damagePartSchema = z.object({
  formula: shortText(160).min(1),
  type: shortText(120).min(1),
  notes: shortText(400),
});

const strikeSchema = z.object({
  category: z.enum(["melee", "ranged"]),
  name: shortText(160).min(1),
  activation: nullableText(80),
  attackModifier: boundedModifier,
  multipleAttackPenalty: z.array(boundedModifier).max(3),
  traits: traitListSchema,
  reach: nullableText(80),
  range: nullableText(80),
  damage: z.array(damagePartSchema).max(12),
  rider: shortText(1200),
  rawText: shortText(2400),
});

const spellEntrySchema = z.object({
  rank: shortText(40).min(1),
  spells: z.array(shortText(120).min(1)).max(32),
  uses: nullableText(80),
  frequency: nullableText(160),
  notes: shortText(400),
});

const spellcastingSchema = z.object({
  tradition: shortText(80).min(1),
  method: z.enum(["prepared", "spontaneous", "innate", "focus", "other"]),
  dc: z.number().int().min(0).max(60).nullable(),
  attackModifier: boundedModifier.nullable(),
  entries: z.array(spellEntrySchema).max(32),
  notes: shortText(800),
});

const specialAbilitySchema = z.object({
  section: z.enum(["general", "defensive", "offensive"]),
  name: shortText(160).min(1),
  activation: z.enum(["passive", "free-action", "reaction", "one-action", "two-actions", "three-actions", "aura", "other"]),
  actionCost: nullableText(20),
  traits: traitListSchema,
  frequency: nullableText(160),
  trigger: nullableText(800),
  requirements: nullableText(800),
  area: nullableText(160),
  save: nullableText(160),
  cooldown: nullableText(160),
  effect: shortText(4000),
  rawText: shortText(4000),
});

const unparsedFragmentSchema = z.object({
  label: shortText(160).min(1),
  text: shortText(2400).min(1),
  reason: shortText(400),
});

const defaultPerception = { modifier: 0, senses: [], notes: "" };
const defaultLanguages = { names: [], additionalCount: 0, communicationNotes: "" };
const defaultAbilityModifiers = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
const defaultDefenses = {
  armorClass: 0,
  armorClassNotes: "",
  saves: {
    fortitude: { modifier: 0, notes: "" },
    reflex: { modifier: 0, notes: "" },
    will: { modifier: 0, notes: "" },
  },
  hitPoints: [],
  immunities: [],
  resistances: [],
  weaknesses: [],
  notes: "",
};

function canonicalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForComparison);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalizeForComparison(entry)]));
  }
  return typeof value === "string" ? value.trim() : value;
}

function hasSameStructuredValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeForComparison(left)) === JSON.stringify(canonicalizeForComparison(right));
}

export const enemyStatBlockSchema = z.object({
  schemaVersion: z.literal(1),
  recallKnowledge: recallKnowledgeSchema.nullable().default(null),
  perception: perceptionSchema.default(defaultPerception),
  languages: languagesSchema.default(defaultLanguages),
  skills: z.array(skillSchema).max(48).default([]),
  abilityModifiers: abilityModifiersSchema.default(defaultAbilityModifiers),
  items: z.array(shortText(160).min(1)).max(64).default([]),
  defenses: defensesSchema.default(defaultDefenses),
  movement: z.array(movementSchema).max(16).default([]),
  strikes: z.array(strikeSchema).max(32).default([]),
  spellcasting: z.array(spellcastingSchema).max(16).default([]),
  specialAbilities: z.array(specialAbilitySchema).max(64).default([]),
  unparsedFragments: z.array(unparsedFragmentSchema).max(24).default([]),
});

export const completeEnemyStatBlockSchema = z.object({
  schemaVersion: z.literal(1),
  recallKnowledge: recallKnowledgeSchema.nullable(),
  perception: perceptionSchema,
  languages: languagesSchema,
  skills: z.array(skillSchema).max(48),
  abilityModifiers: abilityModifiersSchema,
  items: z.array(shortText(160).min(1)).max(64),
  defenses: defensesSchema,
  movement: z.array(movementSchema).max(16),
  strikes: z.array(strikeSchema).max(32),
  spellcasting: z.array(spellcastingSchema).max(16),
  specialAbilities: z.array(specialAbilitySchema).max(64),
  unparsedFragments: z.array(unparsedFragmentSchema).max(24),
}).superRefine((statBlock, context) => {
  if (statBlock.defenses.armorClass <= 0) {
    context.addIssue({ code: "custom", path: ["defenses", "armorClass"], message: "A complete enemy stat block needs armor class." });
  }
  if (!statBlock.defenses.hitPoints.some((entry) => entry.value > 0)) {
    context.addIssue({ code: "custom", path: ["defenses", "hitPoints"], message: "A complete enemy stat block needs hit points." });
  }
});

const enemyPublicFields = {
  name: shortText(160).min(1),
  playerDescription: shortText(4000),
  isRevealed: z.boolean().default(false),
  artPath: nullableText(500).optional(),
  artUrl: z.string().url().nullable().optional(),
};

const enemyClassificationFields = {
  level: z.number().int().min(-1).max(25),
  size: enemySizeSchema,
  rarity: enemyRaritySchema,
  traits: traitListSchema,
  family: nullableText(160),
};

export const enemyPublicRecordSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  authorId: z.string().uuid(),
  ...enemyPublicFields,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const enemyGmSummarySchema = enemyPublicRecordSchema.extend({
  ...enemyClassificationFields,
  origin: enemyOriginSchema,
  sourceUpdatedAt: z.string().datetime().nullable(),
});

export const enemySourceSnapshotSchema = z.object({
  provider: z.literal("aon"),
  system: z.literal("Starfinder 2e"),
  externalId: z.number().int().positive(),
  canonicalUrl: z.string().url(),
  sourceTitle: shortText(240).min(1),
  sourcePage: shortText(240).min(1),
  rulesStatus: shortText(120),
  parserVersion: shortText(80).min(1),
  schemaVersion: z.literal(1),
  retrievedAt: z.string().datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  parsedPayload: z.object({
    name: shortText(160).min(1),
    level: z.number().int().min(-1).max(25),
    size: enemySizeSchema,
    rarity: enemyRaritySchema,
    traits: traitListSchema,
    family: nullableText(160),
    statBlock: completeEnemyStatBlockSchema,
  }),
}).superRefine((snapshot, context) => {
  let parsedUrl;
  try {
    parsedUrl = parseAonCreatureUrl(snapshot.canonicalUrl);
  } catch {
    context.addIssue({ code: "custom", path: ["canonicalUrl"], message: "Source provenance must use a canonical Archives of Nethys creature URL." });
    return;
  }

  if (snapshot.canonicalUrl !== parsedUrl.canonicalUrl) {
    context.addIssue({ code: "custom", path: ["canonicalUrl"], message: "Source provenance must use the canonical Archives of Nethys creature URL." });
  }
  if (snapshot.externalId !== parsedUrl.externalId) {
    context.addIssue({ code: "custom", path: ["externalId"], message: "Source provenance identifier does not match its URL." });
  }
});

export const enemyDetailsSchema = z.object({
  enemyId: z.string().uuid(),
  campaignId: z.string().uuid(),
  ...enemyClassificationFields,
  statBlock: enemyStatBlockSchema,
  gmNotesMarkdown: z.string().max(20000),
  origin: enemyOriginSchema,
  artSubject: nullableText(1600),
  artPrompt: nullableText(4000),
  artProvider: nullableText(80),
  sourceSnapshot: enemySourceSnapshotSchema.nullable(),
});

export const createEnemySchema = z.object({
  ...enemyPublicFields,
  ...enemyClassificationFields,
  statBlock: enemyStatBlockSchema,
  gmNotesMarkdown: z.string().max(20000).default(""),
  origin: enemyOriginSchema.default("manual"),
  artSubject: nullableText(1600).optional(),
  artPrompt: nullableText(4000).optional(),
  artProvider: nullableText(80).optional(),
  sourceSnapshot: enemySourceSnapshotSchema.nullable().optional(),
}).superRefine((enemy, context) => {
  if (enemy.isRevealed && !enemy.playerDescription.trim()) {
    context.addIssue({ code: "custom", path: ["playerDescription"], message: "A revealed enemy needs a player-safe description." });
  }

  if (enemy.origin === "aon" && !enemy.sourceSnapshot) {
    context.addIssue({ code: "custom", path: ["sourceSnapshot"], message: "An Archives of Nethys enemy needs source provenance." });
  }

  if (enemy.origin !== "manual" && !completeEnemyStatBlockSchema.safeParse(enemy.statBlock).success) {
    context.addIssue({ code: "custom", path: ["statBlock"], message: "Imported and AI enemies need a complete structured stat block." });
  }

  if (enemy.origin === "aon" && enemy.sourceSnapshot && !hasSameStructuredValue({
    name: enemy.name,
    level: enemy.level,
    size: enemy.size,
    rarity: enemy.rarity,
    traits: enemy.traits,
    family: enemy.family,
    statBlock: enemy.statBlock,
  }, enemy.sourceSnapshot.parsedPayload)) {
    context.addIssue({ code: "custom", path: ["sourceSnapshot", "parsedPayload"], message: "Source provenance must match the reviewed enemy fields." });
  }

  if (enemy.origin !== "aon" && enemy.sourceSnapshot) {
    context.addIssue({ code: "custom", path: ["sourceSnapshot"], message: "Only Archives of Nethys enemies may retain source provenance." });
  }

  if (!enemy.artPath && (enemy.artPrompt || enemy.artProvider)) {
    context.addIssue({ code: "custom", path: ["artPrompt"], message: "Artwork provenance requires an approved artwork path." });
  }
});

export const updateEnemySchema = z.object({
  name: enemyPublicFields.name.optional(),
  playerDescription: enemyPublicFields.playerDescription.optional(),
  isRevealed: z.boolean().optional(),
  artPath: enemyPublicFields.artPath,
  artUrl: enemyPublicFields.artUrl,
  level: enemyClassificationFields.level.optional(),
  size: enemyClassificationFields.size.optional(),
  rarity: enemyClassificationFields.rarity.optional(),
  traits: enemyClassificationFields.traits.optional(),
  family: enemyClassificationFields.family.optional(),
  statBlock: enemyStatBlockSchema.optional(),
  gmNotesMarkdown: z.string().max(20000).optional(),
  origin: enemyOriginSchema.optional(),
  artSubject: nullableText(1600).optional(),
  artPrompt: nullableText(4000).optional(),
  artProvider: nullableText(80).optional(),
  sourceSnapshot: enemySourceSnapshotSchema.nullable().optional(),
  expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  expectedUpdatedAt: z.string().datetime(),
}).superRefine((value, context) => {
  if (value.origin === "aon" && value.sourceSnapshot === null) {
    context.addIssue({ code: "custom", path: ["sourceSnapshot"], message: "An Archives of Nethys enemy needs source provenance." });
  }
  if (value.origin && value.origin !== "aon" && value.sourceSnapshot) {
    context.addIssue({ code: "custom", path: ["sourceSnapshot"], message: "Only Archives of Nethys enemies may retain source provenance." });
  }
  if (Object.keys(value).length === 0) {
    context.addIssue({ code: "custom", message: "At least one enemy field is required." });
  }
});

const enemyDraftFields = {
  name: shortText(160).min(1),
  playerDescription: shortText(4000),
  ...enemyClassificationFields,
  statBlock: completeEnemyStatBlockSchema,
  gmNotesMarkdown: z.string().max(20000),
  artSubject: shortText(1600),
};

export const enemyBackgroundJobSchema = z.object({
  generationRunId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(200000),
  model: z.string().trim().min(1).max(160),
});

export type EnemyBackgroundJob = z.infer<typeof enemyBackgroundJobSchema>;

export const enemyAiDraftSchema = z.object(enemyDraftFields).superRefine((draft, context) => {
  if (!draft.playerDescription.trim()) {
    context.addIssue({ code: "custom", path: ["playerDescription"], message: "AI drafts need a player-safe description." });
  }
});

const enemyImportDraftSchema = z.object(enemyDraftFields);

export const enemyBriefDraftSchema = z.object({
  playerDescription: shortText(4000),
  artSubject: shortText(1600),
});

const aonSourceUrlField = z.string().trim().min(1).max(2000);

export const enemyImportRequestSchema = z.object({
  url: aonSourceUrlField.optional(),
  sourceUrl: aonSourceUrlField.optional(),
  existingEnemyId: z.string().uuid().optional(),
}).refine((request) => Boolean(request.url ?? request.sourceUrl), {
  message: "An Archives of Nethys source URL is required.",
  path: ["url"],
});

export const enemyReimportRequestSchema = z.object({
  expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  expectedUpdatedAt: z.string().datetime(),
  url: aonSourceUrlField.optional(),
  sourceUrl: aonSourceUrlField.optional(),
  preserved: z.object({
    playerDescription: shortText(4000),
    isRevealed: z.boolean(),
    artPath: enemyPublicFields.artPath,
    gmNotesMarkdown: z.string().max(20000),
    artSubject: nullableText(1600),
    artPrompt: nullableText(4000),
    artProvider: nullableText(80),
  }).optional(),
  reviewedSource: z.object({
    name: enemyDraftFields.name,
    level: enemyDraftFields.level,
    size: enemyDraftFields.size,
    rarity: enemyDraftFields.rarity,
    traits: enemyDraftFields.traits,
    family: enemyDraftFields.family,
    statBlock: enemyDraftFields.statBlock,
    sourceSnapshot: enemySourceSnapshotSchema,
  }).optional(),
});

export const enemyImportDifferenceSchema = z.object({
  section: z.enum(["identity", "classification", "recallKnowledge", "perception", "languages", "skills", "abilities", "defenses", "movement", "strikes", "spellcasting", "source"]),
  status: z.enum(["new", "unchanged", "changed"]),
  summary: shortText(800).min(1),
});

export const enemyImportPreviewSchema = z.object({
  campaignId: z.string().uuid(),
  draft: enemyImportDraftSchema,
  sourceSnapshot: enemySourceSnapshotSchema,
  warnings: z.array(shortText(800).min(1)).max(24),
  existingEnemyId: z.string().uuid().nullable(),
  existingSourceHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  differences: z.array(enemyImportDifferenceSchema).max(32),
});

export type EnemyPublicRecord = z.infer<typeof enemyPublicRecordSchema>;
export type EnemyGmSummary = z.infer<typeof enemyGmSummarySchema>;
export type EnemySize = z.infer<typeof enemySizeSchema>;
export type EnemyRarity = z.infer<typeof enemyRaritySchema>;
export type EnemyOrigin = z.infer<typeof enemyOriginSchema>;
export type EnemyStatBlockV1 = z.infer<typeof enemyStatBlockSchema>;
export type EnemySourceSnapshot = z.infer<typeof enemySourceSnapshotSchema>;
export type EnemyDetails = z.infer<typeof enemyDetailsSchema>;
export type CreateEnemy = z.infer<typeof createEnemySchema>;
export type UpdateEnemy = z.infer<typeof updateEnemySchema>;
export type EnemyAiDraft = z.infer<typeof enemyAiDraftSchema>;
export type EnemyBriefDraft = z.infer<typeof enemyBriefDraftSchema>;
export type EnemyImportPreview = z.infer<typeof enemyImportPreviewSchema>;
export type EnemyImportRequest = z.infer<typeof enemyImportRequestSchema>;
export type EnemyReimportRequest = z.infer<typeof enemyReimportRequestSchema>;