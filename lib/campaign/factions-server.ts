import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { ApiFaction } from "@/lib/campaign/types";

export type CampaignFactionsResult = {
  role: "gm" | "player";
  displayName: string;
  factions: ApiFaction[];
};

export type CampaignFactionResult = {
  role: "gm" | "player";
  displayName: string;
  faction: ApiFaction;
};

const factionColumns = "id, author_id, name, description, status, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

export async function getCampaignFactions(campaignId: string): Promise<CampaignFactionsResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("factions")
    .select(factionColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to read campaign factions: ${error.message}`);

  const factions = await addCampaignArtUrls(context.supabase, data ?? []);
  return { role: membership.role, displayName: membership.displayName, factions };
}

export async function getCampaignFaction(campaignId: string, factionId: string): Promise<CampaignFactionResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("factions")
    .select(factionColumns)
    .eq("id", factionId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign faction: ${error.message}`);
  if (!data) return null;

  const [faction] = await addCampaignArtUrls(context.supabase, [data]);
  return { role: membership.role, displayName: membership.displayName, faction };
}