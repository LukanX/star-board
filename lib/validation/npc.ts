import { z } from "zod";

const npcFields = {
  name: z.string().trim().min(1).max(160),
  species: z.string().trim().max(120).default(""),
  role: z.string().trim().max(160).default(""),
  description: z.string().trim().max(4000).default(""),
  playerNotesMarkdown: z.string().max(20000).default(""),
  artSubject: z.string().trim().max(1600).nullable().optional(),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
};

export const createNpcSchema = z.object({
  ...npcFields,
  gmNotesMarkdown: z.string().max(20000).default(""),
});

export const updateNpcSchema = z.object({
  name: npcFields.name.optional(),
  species: npcFields.species.optional(),
  role: npcFields.role.optional(),
  description: npcFields.description.optional(),
  playerNotesMarkdown: npcFields.playerNotesMarkdown.optional(),
  gmNotesMarkdown: z.string().max(20000).optional(),
  artSubject: npcFields.artSubject,
  artPath: npcFields.artPath,
  artPrompt: npcFields.artPrompt,
  artProvider: npcFields.artProvider,
  placeId: npcFields.placeId,
});