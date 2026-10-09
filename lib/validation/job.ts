import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().max(4000).default(""),
  playerNotesMarkdown: z.string().max(20000).default(""),
  giverType: z.enum(["npc", "faction"]).nullable().default(null),
  giverId: z.string().uuid().nullable().default(null),
  status: z.enum(["draft", "open", "archived"]).default("draft"),
  hook: z.string().max(1200).default(""),
  gmNotesMarkdown: z.string().max(20000).default(""),
  artSubject: z.string().trim().max(1600).nullable().optional(),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
}).superRefine((input, context) => {
  if ((input.giverType === null) !== (input.giverId === null)) {
    context.addIssue({
      code: "custom",
      path: [input.giverType === null ? "giverType" : "giverId"],
      message: "Select both a giver type and giver, or leave both unassigned.",
    });
  }
});
