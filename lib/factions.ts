import type { SupabaseClient } from "@supabase/supabase-js";

export async function validateCampaignFaction(
  supabase: SupabaseClient,
  campaignId: string,
  factionId: string | null | undefined,
) {
  if (!factionId) return { valid: true, unavailable: false };

  const { data, error } = await supabase
    .from("factions")
    .select("id")
    .eq("id", factionId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  return { valid: Boolean(data) && !error, unavailable: Boolean(error) };
}