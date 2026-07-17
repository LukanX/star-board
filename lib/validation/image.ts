import { z } from "zod";

export const imageGenerationInputSchema = z.object({
  campaignId: z.string().uuid(),
  subject: z.string().trim().min(1).max(1200),
  campaignStyle: z.string().trim().max(600).optional(),
});

export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
