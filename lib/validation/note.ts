import { z } from "zod";

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  bodyMarkdown: z.string().max(20000).default(""),
  visibility: z.enum(["player", "gm"]).default("player"),
  episodeId: z.string().uuid().nullable().optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  bodyMarkdown: z.string().max(20000).optional(),
  visibility: z.enum(["player", "gm"]).optional(),
  episodeId: z.string().uuid().nullable().optional(),
});