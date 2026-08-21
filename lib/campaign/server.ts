import type { CampaignRecord } from "@/lib/campaign/types";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";

export type CampaignRouteAccess = {
  campaign: CampaignRecord;
  role: "gm" | "player";
  displayName: string;
};

export async function getCampaignRouteAccess(campaignId: string): Promise<CampaignRouteAccess | null> {
  const context = await getAuthenticatedUser();

  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("campaigns")
    .select("id, name, system, description, created_by")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read campaign route: ${error.message}`);
  }

  if (!data) return null;

  return {
    campaign: data as CampaignRecord,
    role: membership.role,
    displayName: membership.displayName,
  };
}