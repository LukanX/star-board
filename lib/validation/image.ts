import { z } from "zod";
import { defaultImageAspectRatio, defaultImageSize, imageAspectRatioValues, imageSizeOptions, imageSizeValues } from "@/lib/ai/image-options";

export const imagePromptMaxLength = 3000;

export const imageGenerationInputSchema = z.object({
  campaignId: z.string().uuid(),
  mode: z.enum(["create", "refine"]),
  targetKind: z.enum(["character", "npc", "faction", "job", "place"]),
  model: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(1200),
  aspectRatio: z.enum(imageAspectRatioValues).default(defaultImageAspectRatio),
  size: z.enum(imageSizeValues).default(defaultImageSize),
  campaignStyle: z.string().trim().max(600).optional(),
  refinement: z.string().trim().max(600).optional(),
  currentPrompt: z.string().trim().max(imagePromptMaxLength).optional(),
}).superRefine(({ aspectRatio, size }, context) => {
  if (!imageSizeOptions[aspectRatio].some((option) => option.value === size)) {
    context.addIssue({ code: "custom", path: ["size"], message: `Size ${size} does not match aspect ratio ${aspectRatio}.` });
  }
});

export const imageBackgroundJobSchema = z.object({
  generationRunId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(imagePromptMaxLength),
  model: z.string().trim().min(1).max(160),
  aspectRatio: z.enum(imageAspectRatioValues),
  size: z.enum(imageSizeValues),
}).superRefine(({ aspectRatio, size }, context) => {
  if (!imageSizeOptions[aspectRatio].some((option) => option.value === size)) {
    context.addIssue({ code: "custom", path: ["size"], message: `Size ${size} does not match aspect ratio ${aspectRatio}.` });
  }
});

export type ImageBackgroundJob = z.infer<typeof imageBackgroundJobSchema>;

export const imageDraftSchema = z.object({
  generationRunId: z.string().uuid(),
  targetKind: z.enum(["character", "npc", "faction", "job", "place"]),
  mode: z.enum(["create", "refine"]),
  subject: z.string().trim().min(1).max(1200),
  aspectRatio: z.enum(imageAspectRatioValues),
  size: z.enum(imageSizeValues),
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
