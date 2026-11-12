import { z } from "zod";
import { defaultImageAspectRatio, imageAspectRatioValues, imageResolutionValues, imageSizeOptions, imageSizeValues } from "@/lib/ai/image-options";
import { visualStyleTextSchema } from "@/lib/validation/visual-style";
import { campaignArtPathSchema } from "@/lib/validation/art";
import { npcReferenceContextSchema, referenceBindingSchema, referenceStatusesSchema } from "@/lib/validation/reference";
import { studioCompositionSchema, studioImageReferenceSchema, studioManifestSchema } from "@/lib/validation/studio";

export const imagePromptMaxLength = 3000;
export const imagePurposes = ["entity-art", "style-preview", "studio-art"] as const;
export const imageTargetKinds = ["character", "npc", "faction", "job", "place", "enemy", "visual-style", "scene", "battlemap"] as const;
export const imageOperations = ["generate", "redo", "edit"] as const;
export const imageEditInstructionMaxLength = 600;

export const imageEditSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft"), generationRunId: z.string().uuid(), manifest: studioManifestSchema.optional() }).strict(),
  z.object({ type: z.literal("saved-art"), entityId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("studio-asset"), assetId: z.string().uuid() }).strict(),
]);

export const imageEditSchema = z.object({
  instruction: z.string().trim().min(1).max(imageEditInstructionMaxLength),
  source: imageEditSourceSchema,
}).strict();

export type ImageEdit = z.infer<typeof imageEditSchema>;
export const imageGenerationInputSchema = z.object({
  campaignId: z.string().uuid(),
  mode: z.enum(["create", "refine"]),
  targetKind: z.enum(imageTargetKinds),
  characterId: z.string().uuid().optional(),
  npcReferenceContext: npcReferenceContextSchema.optional(),
  enemyReferenceContext: z.object({ ancestryReference: referenceBindingSchema.nullable().optional() }).strict().optional(),
  purpose: z.enum(imagePurposes).default("entity-art"),
  model: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(1200).optional(),
  visualStyleId: z.string().uuid().optional(),
  visualStyleOverride: visualStyleTextSchema.optional(),
  parentPlaceId: z.string().uuid().nullable().optional(),
  aspectRatio: z.enum(imageAspectRatioValues).default(defaultImageAspectRatio),
  size: z.enum(imageSizeValues).optional(),
  resolution: z.enum(imageResolutionValues).optional(),
  refinement: z.string().trim().max(600).optional(),
  currentPrompt: z.string().trim().max(imagePromptMaxLength).optional(),
  studio: studioCompositionSchema.optional(),
  operation: z.enum(imageOperations).default("generate"),
  parentRunId: z.string().uuid().optional(),
  edit: imageEditSchema.optional(),
}).superRefine(({ aspectRatio, size, targetKind, characterId, parentPlaceId, purpose, visualStyleId, visualStyleOverride, npcReferenceContext, enemyReferenceContext, studio, subject, operation, parentRunId, edit, resolution }, context) => {
  if (resolution && size) context.addIssue({ code: "custom", path: ["resolution"], message: "Choose native resolution or fixed pixel size, not both." });
  const isStudio = targetKind === "scene" || targetKind === "battlemap";
  if (isStudio !== (purpose === "studio-art") || Boolean(studio) !== (isStudio && !edit))
    context.addIssue({ code: "custom", path: ["studio"], message: "Studio composition, purpose and target must match." });
  if ((operation === "edit") !== Boolean(edit))
    context.addIssue({ code: "custom", path: ["edit"], message: "Edit details are required for, and only valid for, edit requests." });
  if (operation === "generate" && parentRunId)
    context.addIssue({ code: "custom", path: ["parentRunId"], message: "A parent run is only valid for redo or edit requests." });
  if (!edit && !subject)
    context.addIssue({ code: "custom", path: ["subject"], message: "A subject is required." });
  if (edit) {
    if (purpose === "style-preview") context.addIssue({ code: "custom", path: ["edit"], message: "Style previews cannot be edited." });
    if (edit.source.type === "studio-asset" && !isStudio)
      context.addIssue({ code: "custom", path: ["edit", "source"], message: "Studio assets can only be edited from Studio." });
    if (edit.source.type === "saved-art" && isStudio)
      context.addIssue({ code: "custom", path: ["edit", "source"], message: "Studio art is edited from the Studio library." });
    if (edit.source.type === "draft" && isStudio !== Boolean(edit.source.manifest))
      context.addIssue({ code: "custom", path: ["edit", "source", "manifest"], message: "Studio draft edits require the draft manifest." });
    if (edit.source.type === "saved-art" && targetKind === "character" && edit.source.entityId !== characterId)
      context.addIssue({ code: "custom", path: ["edit", "source", "entityId"], message: "The saved art must belong to the selected character." });
  }
  if (targetKind === "battlemap" && studio?.subjects.some((subject) => subject.kind !== "place"))
    context.addIssue({ code: "custom", path: ["studio"], message: "Battlemaps use a Place, not actor subjects." });
  if (enemyReferenceContext && targetKind !== "enemy") context.addIssue({ code: "custom", path: ["enemyReferenceContext"], message: "Enemy reference context is only valid for enemy artwork." });
  if (npcReferenceContext && targetKind !== "npc") {
    context.addIssue({ code: "custom", path: ["npcReferenceContext"], message: "NPC reference context is only valid for NPC artwork." });
  }
  if (size && !imageSizeOptions[aspectRatio].some((option) => option.value === size)) {
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
  references: referenceStatusesSchema.optional(),
  generationRunId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(imagePromptMaxLength),
  model: z.string().trim().min(1).max(160),
  operation: z.enum(imageOperations).optional(),
  purpose: z.enum(imagePurposes).default("entity-art"),
  aspectRatio: z.enum(imageAspectRatioValues),
  size: z.enum(imageSizeValues).optional(),
  resolution: z.enum(imageResolutionValues).optional(),
  supportedParameters: z.array(z.string().trim().min(1).max(100)).max(64).optional(),
  imageReferences: z.array(studioImageReferenceSchema).max(7).optional(),
  referenceProviders: z.array(z.string().min(1).max(160)).min(1).max(30).optional(),
  editSource: z.object({ path: campaignArtPathSchema }).strict().optional(),
}).superRefine(({ aspectRatio, size, imageReferences, referenceProviders, purpose, editSource }, context) => {
  if (imageReferences?.length && (purpose !== "studio-art" || !referenceProviders?.length))
    context.addIssue({ code: "custom", path: ["imageReferences"], message: "Studio references require verified provider routing." });
  if (editSource && (!referenceProviders?.length || imageReferences?.length))
    context.addIssue({ code: "custom", path: ["editSource"], message: "Image edits require verified provider routing and no other references." });
  if (size && !imageSizeOptions[aspectRatio].some((option) => option.value === size)) {
    context.addIssue({ code: "custom", path: ["size"], message: `Size ${size} does not match aspect ratio ${aspectRatio}.` });
  }
});

export type ImageBackgroundJob = z.input<typeof imageBackgroundJobSchema>;

export const imageDraftSchema = z.object({
  references: referenceStatusesSchema.optional(),
  generationRunId: z.string().uuid(),
  targetKind: z.enum(imageTargetKinds),
  characterId: z.string().uuid().optional(),
  purpose: z.enum(imagePurposes).default("entity-art"),
  mode: z.enum(["create", "refine"]),
  operation: z.enum(imageOperations).default("generate"),
  parentRunId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(1200),
  aspectRatio: z.enum(imageAspectRatioValues),
  size: z.enum(imageSizeValues).optional(),
  resolution: z.enum(imageResolutionValues).optional(),
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
  studioManifest: studioManifestSchema.optional(),
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
