import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type CampaignRole = "gm" | "player";

export type CampaignMembership = {
  role: CampaignRole;
  displayName: string;
};

type CampaignContext = {
  supabase: SupabaseClient;
  user: User;
  role: CampaignRole;
};

export async function getCampaignRole(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string,
): Promise<CampaignRole | null> {
  const { data, error } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read campaign membership: ${error.message}`);
  }

  return data?.role === "gm" || data?.role === "player" ? data.role : null;
}

export async function getCampaignMembership(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string,
): Promise<CampaignMembership | null> {
  const { data, error } = await supabase
    .from("campaign_members")
    .select("role, display_name")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read campaign membership: ${error.message}`);
  }

  if (data?.role !== "gm" && data?.role !== "player") {
    return null;
  }

  return { role: data.role, displayName: data.display_name };
}

export async function getAuthenticatedUser() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return { supabase, user: data.user };
}

export async function requireCampaignGM(campaignId: string): Promise<CampaignContext | null> {
  const context = await getAuthenticatedUser();

  if (!context) {
    return null;
  }

  const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

  if (role !== "gm") {
    return null;
  }

  return { ...context, role };
}
