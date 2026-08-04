import { z } from "zod";

export const updateCampaignDisplayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export const updateCampaignMemberSchema = z.object({
  role: z.enum(["gm", "player"]),
});
