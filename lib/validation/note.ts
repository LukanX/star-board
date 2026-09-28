import { z } from "zod";

export const noteEntitySubjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("character"), id: z.string().uuid() }),
  z.object({ type: z.literal("npc"), id: z.string().uuid() }),
  z.object({ type: z.literal("place"), id: z.string().uuid() }),
  z.object({ type: z.literal("faction"), id: z.string().uuid() }),
  z.object({ type: z.literal("job"), id: z.string().uuid() }),
  z.object({ type: z.literal("enemy"), id: z.string().uuid() }),
]);

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  bodyMarkdown: z.string().max(20000).default(""),
  visibility: z.enum(["player", "gm"]).default("player"),
  episodeId: z.string().uuid().nullable().optional(),
  entity: noteEntitySubjectSchema.optional(),
}).refine((note) => note.episodeId == null || note.entity === undefined, {
  message: "A note cannot belong to both an episode and an entity.",
  path: ["entity"],
});

export const updateNoteSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  bodyMarkdown: z.string().max(20000).optional(),
  visibility: z.enum(["player", "gm"]).optional(),
  episodeId: z.string().uuid().nullable().optional(),
});