import { z } from "zod";
import { enemyBriefDraftSchema, enemyAiDraftSchema, enemyRaritySchema, enemySizeSchema, enemyStatBlockSchema } from "@/lib/validation/enemy";

const campaignContextSchema = z.object({
  campaignId: z.string().uuid(),
  setting: z.string().trim().min(1).max(1200).optional(),
  styleNotes: z.string().trim().max(600).optional(),
});

const missionCurrentDraftSchema = z.object({
  title: z.string().max(160).optional(),
  summary: z.string().max(4000).optional(),
  playerNotes: z.string().max(20000).optional(),
  gmNotes: z.string().max(20000).optional(),
  hook: z.string().max(1200).optional(),
  thumbnailDescription: z.string().max(1600).optional(),
}).partial().optional();

const npcCurrentDraftSchema = z.object({
  name: z.string().max(160).optional(),
  species: z.string().max(120).optional(),
  role: z.string().max(160).optional(),
  shortDescription: z.string().max(4000).optional(),
  playerNotes: z.string().max(20000).optional(),
  gmNotes: z.string().max(20000).optional(),
  visualPrompt: z.string().max(1600).optional(),
}).partial().optional();

const factionCurrentDraftSchema = z.object({
  name: z.string().max(160).optional(),
  status: z.string().max(80).optional(),
  description: z.string().max(4000).optional(),
  visualPrompt: z.string().max(1600).optional(),
}).partial().optional();

const placeCurrentDraftSchema = z.object({
  name: z.string().max(160).optional(),
  kind: z.string().max(80).optional(),
  description: z.string().max(4000).optional(),
  playerNotes: z.string().max(20000).optional(),
  gmNotes: z.string().max(20000).optional(),
  visualPrompt: z.string().max(1600).optional(),
}).partial().optional();

const characterCurrentDraftSchema = z.object({
  name: z.string().max(160).optional(),
  species: z.string().max(120).optional(),
  className: z.string().max(160).optional(),
  level: z.string().max(20).optional(),
  backstoryMarkdown: z.string().max(20000).optional(),
  physicalDescription: z.string().max(4000).optional(),
  visualPrompt: z.string().max(1600).optional(),
}).partial().optional();

const enemyCurrentDraftSchema = z.object({
  name: z.string().max(160).optional(),
  playerDescription: z.string().max(4000).optional(),
  level: z.number().int().min(-1).max(25).optional(),
  size: enemySizeSchema.optional(),
  rarity: enemyRaritySchema.optional(),
  traits: z.array(z.string().max(48)).max(32).optional(),
  family: z.string().max(160).nullable().optional(),
  statBlock: enemyStatBlockSchema.optional(),
  gmNotesMarkdown: z.string().max(20000).optional(),
  artSubject: z.string().max(1600).optional(),
}).partial().optional();

export const missionGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  title: z.string().trim().max(160).optional(),
  giverType: z.enum(["npc", "faction"]).optional(),
  giverId: z.string().uuid().optional(),
  placeId: z.string().uuid().nullable().optional(),
  giver: z.string().trim().max(160).optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: missionCurrentDraftSchema,
}).superRefine((input, context) => {
  if (input.giverType && !input.giverId) {
    context.addIssue({ code: "custom", path: ["giverId"], message: "A giver ID is required when a giver type is selected." });
  }

  if (input.giverId && !input.giverType) {
    context.addIssue({ code: "custom", path: ["giverType"], message: "A giver type is required when a giver ID is selected." });
  }
});

export const npcGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().max(160).optional(),
  species: z.string().trim().max(120).optional(),
  role: z.string().trim().max(160).optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: npcCurrentDraftSchema,
});

export const factionGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().max(160).optional(),
  status: z.string().trim().max(80).optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: factionCurrentDraftSchema,
});

export const placeGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  parentPlaceId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(160).optional(),
  kind: z.string().trim().max(80).optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: placeCurrentDraftSchema,
});

export const characterGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().max(160).optional(),
  species: z.string().trim().max(120).optional(),
  className: z.string().trim().max(160).optional(),
  level: z.number().int().min(1).max(20).optional(),
  backstoryMarkdown: z.string().max(20000).optional(),
  physicalDescription: z.string().max(4000).optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: characterCurrentDraftSchema,
});

export const enemyGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().max(160).optional(),
  level: z.number().int().min(-1).max(25).optional(),
  size: enemySizeSchema.optional(),
  rarity: enemyRaritySchema.optional(),
  traits: z.array(z.string().trim().min(1).max(48)).max(32).optional(),
  family: z.string().trim().max(160).nullable().optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: enemyCurrentDraftSchema,
});

export const enemyBriefGenerationInputSchema = enemyGenerationInputSchema.extend({
  currentDraft: enemyCurrentDraftSchema,
});

export const missionDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1200),
  playerNotes: z.string().trim().max(2400),
  gmNotes: z.string().trim().max(2400),
  hook: z.string().trim().max(800),
  suggestedGiverType: z.enum(["npc", "faction"]),
  suggestedGiverName: z.string().trim().max(160),
  thumbnailDescription: z.string().trim().min(1).max(1600),
});

export const npcDraftSchema = z.object({
  name: z.string().trim().min(1).max(160),
  species: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  shortDescription: z.string().trim().max(800),
  playerNotes: z.string().trim().max(2400),
  gmNotes: z.string().trim().max(2400),
  motivation: z.string().trim().max(800),
  visualPrompt: z.string().trim().max(1200),
});

export const factionDraftSchema = z.object({
  name: z.string().trim().min(1).max(160),
  status: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(4000),
  visualPrompt: z.string().trim().max(1600),
});

export const placeDraftSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(4000),
  playerNotes: z.string().trim().max(2400),
  gmNotes: z.string().trim().max(2400),
  visualPrompt: z.string().trim().max(1600),
});

export const characterDraftSchema = z.object({
  visualPrompt: z.string().trim().min(1).max(1600),
});

export type MissionGenerationInput = z.infer<typeof missionGenerationInputSchema>;
export type NpcGenerationInput = z.infer<typeof npcGenerationInputSchema>;
export type FactionGenerationInput = z.infer<typeof factionGenerationInputSchema>;
export type PlaceGenerationInput = z.infer<typeof placeGenerationInputSchema>;
export type CharacterGenerationInput = z.infer<typeof characterGenerationInputSchema>;
export type EnemyGenerationInput = z.infer<typeof enemyGenerationInputSchema>;
export type EnemyBriefGenerationInput = z.infer<typeof enemyBriefGenerationInputSchema>;
export type EnemyAiDraft = z.infer<typeof enemyAiDraftSchema>;
export type EnemyBriefDraft = z.infer<typeof enemyBriefDraftSchema>;
