import { z } from "zod";

const campaignNameSchema = z.string().trim().min(1).max(120);
const campaignDescriptionSchema = z.string().trim().max(2000);

export const createCampaignSchema = z.object({
  name: campaignNameSchema,
  description: campaignDescriptionSchema.default(""),
});

export const updateCampaignDetailsSchema = z.object({
  name: campaignNameSchema,
  description: campaignDescriptionSchema,
}).strict();

export type UpdateCampaignDetails = z.infer<typeof updateCampaignDetailsSchema>;

export const redeemJoinLinkSchema = z.object({
  token: z.string().trim().min(20).max(256),
});

export const createJoinLinkSchema = z.object({
  maxUses: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
});
