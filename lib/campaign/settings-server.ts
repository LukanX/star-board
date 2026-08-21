import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";

export type CampaignSettingsResult = {
  role: "gm";
  displayName: string;
};

export async function getCampaignSettings(campaignId: string): Promise<CampaignSettingsResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership || membership.role !== "gm") return null;

  return {
    role: "gm",
    displayName: membership.displayName,
  };
}