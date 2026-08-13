import { z } from "zod";

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

export const missionGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  model: z.string().trim().min(1).max(160).optional(),
  title: z.string().trim().max(160).optional(),
  giver: z.string().trim().max(160).optional(),
  focus: z.string().trim().max(600).optional(),
  currentDraft: missionCurrentDraftSchema,
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

export type MissionGenerationInput = z.infer<typeof missionGenerationInputSchema>;
export type NpcGenerationInput = z.infer<typeof npcGenerationInputSchema>;
export type FactionGenerationInput = z.infer<typeof factionGenerationInputSchema>;
export type PlaceGenerationInput = z.infer<typeof placeGenerationInputSchema>;
