import { z } from "zod";

export const imagePromptMaxLength = 3000;

export const imageGenerationInputSchema = z.object({
  campaignId: z.string().uuid(),
  mode: z.enum(["create", "refine"]),
  targetKind: z.enum(["character", "npc", "faction", "job"]),
  model: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(1200),
  campaignStyle: z.string().trim().max(600).optional(),
  refinement: z.string().trim().max(600).optional(),
  currentPrompt: z.string().trim().max(imagePromptMaxLength).optional(),
});

export const imageDraftSchema = z.object({
  generationRunId: z.string().uuid(),
  targetKind: z.enum(["character", "npc", "faction", "job"]),
  mode: z.enum(["create", "refine"]),
  subject: z.string().trim().min(1).max(1200),
  prompt: z.string().trim().min(1).max(imagePromptMaxLength),
  image: z.object({
    base64: z.string().min(1).nullable(),
    url: z.string().url().nullable(),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  }).refine(({ base64, url }) => Boolean(base64 || url), {
    message: "An image draft must include base64 data or a URL.",
  }),
  provider: z.literal("openrouter"),
  model: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type ImageDraft = z.infer<typeof imageDraftSchema>;
