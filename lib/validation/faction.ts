import { z } from "zod";

const factionFields = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  status: z.string().trim().min(1).max(80).default("active"),
  artSubject: z.string().trim().max(1600).nullable().optional(),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
};

export const createFactionSchema = z.object(factionFields);

export const updateFactionSchema = z.object({
  name: factionFields.name.optional(),
  description: factionFields.description.optional(),
  status: factionFields.status.optional(),
  artSubject: factionFields.artSubject,
  artPath: factionFields.artPath,
  artPrompt: factionFields.artPrompt,
  artProvider: factionFields.artProvider,
  placeId: factionFields.placeId,
});