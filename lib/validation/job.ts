import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(4000).default(""),
  playerNotesMarkdown: z.string().max(20000).default(""),
  giverType: z.enum(["npc", "faction"]),
  giverId: z.string().uuid(),
  status: z.enum(["draft", "open", "archived"]).default("draft"),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
});
