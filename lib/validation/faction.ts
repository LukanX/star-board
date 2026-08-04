import { z } from "zod";

const factionFields = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  status: z.string().trim().min(1).max(80).default("active"),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
};

export const createFactionSchema = z.object(factionFields);

export const updateFactionSchema = z.object({
  name: factionFields.name.optional(),
  description: factionFields.description.optional(),
  status: factionFields.status.optional(),
  artPath: factionFields.artPath,
  artPrompt: factionFields.artPrompt,
});