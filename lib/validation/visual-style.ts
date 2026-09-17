import { z } from "zod";

export const visualStyleNameMaxLength = 80;
export const visualStyleTextMaxLength = 1200;
export const visualStyleVibeMaxLength = 600;
export const visualStyleDirectionNotesMaxLength = 600;

export const visualStyleStatuses = ["draft", "ready"] as const;
export const visualStyleDirections = [
  "choose-for-me",
  "inked-illustration",
  "painterly",
  "cinematic-realism",
  "graphic-design",
] as const;

const trimmedText = (maxLength: number, label: string) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim(), `${label} must not have leading or trailing whitespace.`);

const optionalTrimmedText = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .refine((value) => value === value.trim(), "Text must not have leading or trailing whitespace.")
    .optional();

export const visualStyleNameSchema = trimmedText(visualStyleNameMaxLength, "Style name");
export const visualStyleTextSchema = trimmedText(visualStyleTextMaxLength, "Visual style");
export const visualStylePreviewSaveSchema = z.object({
  generationRunId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(3000),
});

export const visualStyleWizardInputSchema = z.object({
  campaignVibe: optionalTrimmedText(visualStyleVibeMaxLength),
  artDirection: z.enum(visualStyleDirections).default("choose-for-me"),
  directionNotes: optionalTrimmedText(visualStyleDirectionNotesMaxLength),
});

export const visualStyleStatusSchema = z.enum(visualStyleStatuses);

export const visualStyleCreateInputSchema = z.object({
  name: visualStyleNameSchema,
  visualStyle: visualStyleTextSchema,
  status: visualStyleStatusSchema.default("draft"),
  wizardInputs: visualStyleWizardInputSchema.default({ artDirection: "choose-for-me" }),
  apply: z.boolean().default(false),
  preview: visualStylePreviewSaveSchema.optional(),
});

export const visualStyleUpdateInputSchema = z.object({
  name: visualStyleNameSchema,
  visualStyle: visualStyleTextSchema,
  status: visualStyleStatusSchema,
  wizardInputs: visualStyleWizardInputSchema,
  expectedRevision: z.number().int().positive(),
  apply: z.boolean().default(false),
  preview: visualStylePreviewSaveSchema.optional(),
});

export const visualStyleGenerationInputSchema = z.object({
  campaignId: z.string().uuid(),
  model: z.string().trim().min(1).max(160).optional(),
  campaignVibe: optionalTrimmedText(visualStyleVibeMaxLength),
  artDirection: z.enum(visualStyleDirections).default("choose-for-me"),
  directionNotes: optionalTrimmedText(visualStyleDirectionNotesMaxLength),
});

export const visualStylePreviewAttachInputSchema = visualStylePreviewSaveSchema.extend({
  expectedRevision: z.number().int().positive(),
});

export const visualStyleDraftOutputSchema = z.object({
  name: visualStyleNameSchema,
  visualStyle: visualStyleTextSchema,
  rationale: z.string().max(600),
});

export type VisualStyleDirection = (typeof visualStyleDirections)[number];
export type VisualStyleStatus = (typeof visualStyleStatuses)[number];
export type VisualStyleWizardInput = z.infer<typeof visualStyleWizardInputSchema>;
export type VisualStyleDraftOutput = z.infer<typeof visualStyleDraftOutputSchema>;
export type VisualStyleGenerationInput = z.infer<typeof visualStyleGenerationInputSchema>;