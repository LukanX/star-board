import { z } from "zod";

export const systemReferenceKindSchema = z.enum(["ancestry", "creature_trait"]);
export const systemReferenceContentSchema = z.object({
  appearance: z.string().max(4000),
  lore: z.string().max(8000),
  traitContext: z.string().max(4000),
  sourceNotes: z.string().max(2000),
}).strict();
export const systemReferenceSaveSchema = systemReferenceContentSchema.extend({
  expectedRevision: z.number().int().min(0),
}).strict();
export const systemReferenceSettingsSchema = z.object({
  appearance: z.boolean(),
  lore: z.boolean(),
  creatureTraits: z.boolean(),
}).strict();
export type SystemReferenceContent = z.infer<typeof systemReferenceContentSchema>;
export type SystemReferenceSettings = z.infer<typeof systemReferenceSettingsSchema>;
export const initialSystemReferenceSettings: SystemReferenceSettings = { appearance: false, lore: false, creatureTraits: false };
