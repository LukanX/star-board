import { getAuthenticatedUser, getCampaignMembership, type CampaignMembership } from "@/lib/auth/permissions";
import type { ApiCampaignMember } from "@/lib/campaign/types";

export type CampaignMembersResult = {
  currentUserId: string;
  role: CampaignMembership["role"];
  displayName: string;
  members: ApiCampaignMember[];
};

type MemberRow = {
  user_id: string;
  role: ApiCampaignMember["role"];
  display_name: string;
  joined_at: string;
};

export async function getCampaignMembers(campaignId: string): Promise<CampaignMembersResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("campaign_members")
    .select("user_id, role, display_name, joined_at")
    .eq("campaign_id", campaignId)
    .order("joined_at", { ascending: true });

  if (error) throw new Error(`Unable to read campaign members: ${error.message}`);

  return {
    currentUserId: context.user.id,
    role: membership.role,
    displayName: membership.displayName,
    members: ((data ?? []) as MemberRow[]).map((member) => ({
      userId: member.user_id,
      role: member.role,
      displayName: member.display_name,
      joinedAt: member.joined_at,
    })),
  };
}