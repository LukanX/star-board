import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
});

export const redeemJoinLinkSchema = z.object({
  token: z.string().trim().min(20).max(256),
});

export const createJoinLinkSchema = z.object({
  maxUses: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
});
