import { z } from "zod";

const createPlaceFields = {
  name: z.string().trim().min(1).max(160),
  kind: z.string().trim().min(1).max(80).default("location"),
  description: z.string().trim().max(4000).default(""),
  playerNotesMarkdown: z.string().max(20000).default(""),
  parentPlaceId: z.string().uuid().nullable().optional(),
  artSubject: z.string().trim().max(1600).nullable().optional(),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
};

const updatePlaceFields = {
  name: z.string().trim().min(1).max(160),
  kind: z.string().trim().min(1).max(80),
  description: z.string().trim().max(4000),
  playerNotesMarkdown: z.string().max(20000),
  parentPlaceId: z.string().uuid().nullable(),
  artSubject: z.string().trim().max(1600).nullable(),
  artPath: z.string().trim().max(500).nullable(),
  artPrompt: z.string().trim().max(4000).nullable(),
  artProvider: z.string().trim().max(80).nullable(),
};

export const createPlaceSchema = z.object({
  ...createPlaceFields,
  gmNotesMarkdown: z.string().max(20000).default(""),
});

export const updatePlaceSchema = z.object({
  name: updatePlaceFields.name.optional(),
  kind: updatePlaceFields.kind.optional(),
  description: updatePlaceFields.description.optional(),
  playerNotesMarkdown: updatePlaceFields.playerNotesMarkdown.optional(),
  parentPlaceId: updatePlaceFields.parentPlaceId.optional(),
  gmNotesMarkdown: z.string().max(20000).optional(),
  artSubject: updatePlaceFields.artSubject.optional(),
  artPath: updatePlaceFields.artPath.optional(),
  artPrompt: updatePlaceFields.artPrompt.optional(),
  artProvider: updatePlaceFields.artProvider.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one place field is required.",
});
