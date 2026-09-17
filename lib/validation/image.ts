import { z } from "zod";
import { defaultImageAspectRatio, defaultImageSize, imageAspectRatioValues, imageSizeOptions, imageSizeValues } from "@/lib/ai/image-options";
import { visualStyleTextSchema } from "@/lib/validation/visual-style";

export const imagePromptMaxLength = 3000;
export const imagePurposes = ["entity-art", "style-preview"] as const;
export const imageTargetKinds = ["character", "npc", "faction", "job", "place", "enemy", "visual-style"] as const;

export const imageGenerationInputSchema = z.object({
  campaignId: z.string().uuid(),
  mode: z.enum(["create", "refine"]),
  targetKind: z.enum(imageTargetKinds),
  characterId: z.string().uuid().optional(),
  purpose: z.enum(imagePurposes).default("entity-art"),
  model: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(1200),
  visualStyleId: z.string().uuid().optional(),
  visualStyleOverride: visualStyleTextSchema.optional(),
  parentPlaceId: z.string().uuid().nullable().optional(),
  aspectRatio: z.enum(imageAspectRatioValues).default(defaultImageAspectRatio),
  size: z.enum(imageSizeValues).default(defaultImageSize),
  refinement: z.string().trim().max(600).optional(),
  currentPrompt: z.string().trim().max(imagePromptMaxLength).optional(),
}).superRefine(({ aspectRatio, size, targetKind, characterId, parentPlaceId, purpose, visualStyleId, visualStyleOverride }, context) => {
  if (!imageSizeOptions[aspectRatio].some((option) => option.value === size)) {
    context.addIssue({ code: "custom", path: ["size"], message: `Size ${size} does not match aspect ratio ${aspectRatio}.` });
  }
  if (targetKind !== "place" && parentPlaceId) {
    context.addIssue({ code: "custom", path: ["parentPlaceId"], message: "Parent context is only valid for Place artwork." });
  }
  if (targetKind === "character" && !characterId) {
    context.addIssue({ code: "custom", path: ["characterId"], message: "A saved character is required for character artwork." });
  }
  if (targetKind !== "character" && characterId) {
    context.addIssue({ code: "custom", path: ["characterId"], message: "Character context is only valid for character artwork." });
  }
  if (purpose === "style-preview" && targetKind !== "visual-style") {
    context.addIssue({ code: "custom", path: ["targetKind"], message: "Style previews must use the visual-style target." });
  }
  if (targetKind === "visual-style" && purpose !== "style-preview") {
    context.addIssue({ code: "custom", path: ["purpose"], message: "The visual-style target is only valid for style previews." });
  }
  if (visualStyleId && visualStyleOverride) {
    context.addIssue({ code: "custom", path: ["visualStyleOverride"], message: "Choose a saved visual style or draft style text, not both." });
  }
  if (purpose === "style-preview" && !visualStyleId && !visualStyleOverride) {
    context.addIssue({ code: "custom", path: ["visualStyleOverride"], message: "A style preview requires a saved style or draft style text." });
  }
});

export const imageBackgroundJobSchema = z.object({
  generationRunId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(imagePromptMaxLength),
  model: z.string().trim().min(1).max(160),
  purpose: z.enum(imagePurposes).default("entity-art"),
  aspectRatio: z.enum(imageAspectRatioValues),
  size: z.enum(imageSizeValues),
}).superRefine(({ aspectRatio, size }, context) => {
  if (!imageSizeOptions[aspectRatio].some((option) => option.value === size)) {
    context.addIssue({ code: "custom", path: ["size"], message: `Size ${size} does not match aspect ratio ${aspectRatio}.` });
  }
});

export type ImageBackgroundJob = z.input<typeof imageBackgroundJobSchema>;

export const imageDraftSchema = z.object({
  generationRunId: z.string().uuid(),
  targetKind: z.enum(imageTargetKinds),
  characterId: z.string().uuid().optional(),
  purpose: z.enum(imagePurposes).default("entity-art"),
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
  temporaryPath: z.string().optional(),
}).superRefine(({ targetKind, characterId }, context) => {
  if (targetKind === "character" && !characterId) {
    context.addIssue({ code: "custom", path: ["characterId"], message: "A saved character is required for character artwork." });
  }
  if (targetKind !== "character" && characterId) {
    context.addIssue({ code: "custom", path: ["characterId"], message: "Character context is only valid for character artwork." });
  }
});

export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type ImageDraft = z.infer<typeof imageDraftSchema>;
