import { z } from "zod";
import { campaignArtPathSchema } from "@/lib/validation/art";

export const studioSubjectKinds = ["character", "npc", "enemy", "place"] as const;
export const studioSubjectSchema = z.object({
  kind: z.enum(studioSubjectKinds),
  id: z.string().uuid(),
  useImage: z.boolean().default(false),
  // Optional GM section edits. Left undefined (not defaulted) so existing manifest hashes stay stable.
  description: z.string().trim().max(700).optional(),
  includeDescription: z.boolean().optional(),
}).strict();

export const studioCompositionSchema = z.object({
  subjects: z.array(studioSubjectSchema).max(7).default([]),
  grid: z.enum(["gridless", "drawn"]).default("gridless"),
  useCampaignStyle: z.boolean().default(true),
  styleText: z.string().trim().max(1200).optional(),
}).strict().superRefine(({ subjects }, ctx) => {
  if (subjects.filter((subject) => subject.kind === "place").length > 1)
    ctx.addIssue({ code: "custom", path: ["subjects"], message: "Choose at most one Place." });
  if (subjects.filter((subject) => subject.kind !== "place").length > 6)
    ctx.addIssue({ code: "custom", path: ["subjects"], message: "Choose at most six characters, NPCs, or enemies." });
  if (new Set(subjects.map((subject) => `${subject.kind}:${subject.id}`)).size !== subjects.length)
    ctx.addIssue({ code: "custom", path: ["subjects"], message: "A subject can only be selected once." });
});

export const studioImageReferenceSchema = z.object({
  kind: z.enum(studioSubjectKinds),
  id: z.string().uuid(),
  path: campaignArtPathSchema,
  updatedAt: z.string().min(1).max(80),
}).strict();

export const studioSourceSchema = z.object({
  kind: z.enum(studioSubjectKinds),
  id: z.string().uuid(),
  name: z.string().max(160),
  description: z.string().max(700),
  appearance: z.string().max(700).optional(),
}).strict();

export const studioManifestSchema = z.object({
  composition: studioCompositionSchema,
  direction: z.string().min(1).max(1200),
  sources: z.array(studioSourceSchema).max(7),
  style: z.string().max(1200),
  references: z.array(studioImageReferenceSchema).max(7),
}).strict();

export const studioPromptRequestSchema = z.object({
  campaignId: z.string().uuid(),
  kind: z.enum(["scene", "battlemap"]),
  direction: z.string().trim().min(1).max(1200),
  feedback: z.string().trim().max(600).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  visualStyleId: z.string().uuid().optional(),
  composition: studioCompositionSchema,
}).strict().superRefine(({ kind, composition }, ctx) => {
  if (kind === "battlemap" && composition.subjects.some((subject) => subject.kind !== "place"))
    ctx.addIssue({ code: "custom", path: ["composition", "subjects"], message: "Battlemaps can use a Place, not actor subjects." });
});

export const studioPromptOutputSchema = z.object({ prompt: z.string().trim().min(1).max(1200) }).strict();
export const studioDisplaySchema = z.object({
  title: z.string().trim().min(1).max(160),
  caption: z.string().trim().max(2000).default(""),
}).strict();
export const studioApprovalSchema = studioDisplaySchema.extend({
  generationRunId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(3000),
  manifest: studioManifestSchema,
}).strict();
export const studioAssetActionSchema = z.discriminatedUnion("action", [
  studioDisplaySchema.extend({ action: z.literal("edit") }).strict(),
  studioDisplaySchema.extend({ action: z.literal("share") }).strict(),
  z.object({ action: z.literal("unshare") }).strict(),
  z.object({ action: z.literal("delete") }).strict(),
  z.object({
    action: z.literal("assign"),
    kind: z.enum(studioSubjectKinds),
    id: z.string().uuid(),
    expectedUpdatedAt: z.string().min(1).max(80),
  }).strict(),
]);
export const studioLibraryFilters = ["all", "scene", "battlemap", "shared"] as const;
export type StudioLibraryFilter = typeof studioLibraryFilters[number];
export type StudioComposition = z.infer<typeof studioCompositionSchema>;
export type StudioManifest = z.infer<typeof studioManifestSchema>;
export type StudioImageReference = z.infer<typeof studioImageReferenceSchema>;
export type StudioSource = z.infer<typeof studioSourceSchema>;
export type StudioSubjectKind = typeof studioSubjectKinds[number];
