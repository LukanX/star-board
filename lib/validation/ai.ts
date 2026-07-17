import { z } from "zod";

const campaignContextSchema = z.object({
  campaignId: z.string().uuid(),
  setting: z.string().trim().min(1).max(1200).optional(),
  styleNotes: z.string().trim().max(600).optional(),
});

export const missionGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  title: z.string().trim().max(160).optional(),
  giver: z.string().trim().max(160).optional(),
  focus: z.string().trim().max(600).optional(),
});

export const npcGenerationInputSchema = campaignContextSchema.extend({
  mode: z.enum(["create", "refine"]),
  name: z.string().trim().max(160).optional(),
  species: z.string().trim().max(120).optional(),
  role: z.string().trim().max(160).optional(),
  focus: z.string().trim().max(600).optional(),
});

export const missionDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1200),
  playerNotes: z.string().trim().max(2400),
  gmNotes: z.string().trim().max(2400),
  hook: z.string().trim().max(800),
  suggestedGiverType: z.enum(["npc", "faction"]),
  suggestedGiverName: z.string().trim().max(160),
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

export type MissionGenerationInput = z.infer<typeof missionGenerationInputSchema>;
export type NpcGenerationInput = z.infer<typeof npcGenerationInputSchema>;
