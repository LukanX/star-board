import { z } from "zod";

const factionFields = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  status: z.string().trim().min(1).max(80).default("active"),
  playerNotesMarkdown: z.string().max(20000).default(""),
  artSubject: z.string().trim().max(1600).nullable().optional(),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
};

const gmNotesMarkdown = z.string().max(20000);
const memberNpcIds = z.array(z.string().uuid()).max(200).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "NPC roster entries must be unique." });
  }
});

export const createFactionSchema = z.object({
  ...factionFields,
  gmNotesMarkdown: gmNotesMarkdown.default(""),
  memberNpcIds: memberNpcIds.default([]),
});

export const updateFactionSchema = z.object({
  name: factionFields.name.optional(),
  description: factionFields.description.optional(),
  status: factionFields.status.optional(),
  playerNotesMarkdown: factionFields.playerNotesMarkdown.optional(),
  gmNotesMarkdown: gmNotesMarkdown.optional(),
  memberNpcIds: memberNpcIds.nullable().optional(),
  artSubject: factionFields.artSubject,
  artPath: factionFields.artPath,
  artPrompt: factionFields.artPrompt,
  artProvider: factionFields.artProvider,
  placeId: factionFields.placeId,
});