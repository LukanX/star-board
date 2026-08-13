import { z } from "zod";

const characterFieldSchema = z.object({
  name: z.string().trim().min(1).max(160),
  species: z.string().trim().max(120),
  className: z.string().trim().max(160),
  level: z.number().int().min(1).max(20),
  backstoryMarkdown: z.string().max(20000),
  artPath: z.string().trim().max(500).nullable().optional(),
  artPrompt: z.string().trim().max(4000).nullable().optional(),
  artProvider: z.string().trim().max(80).nullable().optional(),
});

export const characterFieldsSchema = characterFieldSchema.extend({
  species: z.string().trim().max(120).default(""),
  className: z.string().trim().max(160).default(""),
  level: z.number().int().min(1).max(20).default(1),
  backstoryMarkdown: z.string().max(20000).default(""),
});

export const createCharacterSchema = characterFieldsSchema;
export const updateCharacterSchema = characterFieldSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one character field is required." },
);
