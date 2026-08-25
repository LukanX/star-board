import { z } from "zod";

const episodeDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Date is invalid.");

export const updateEpisodeSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    summary: z.string().trim().max(4000).optional(),
    playerContextMarkdown: z.string().max(20000).optional(),
    status: z.enum(["planned", "active", "complete", "archived"]).optional(),
    startedAt: episodeDateSchema.nullable().optional(),
    completedAt: episodeDateSchema.nullable().optional(),
    placeId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one episode field is required.")
  .superRefine((value, context) => {
    if (value.startedAt && value.completedAt && value.completedAt < value.startedAt) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Completion date cannot be before the start date." });
    }
  });
