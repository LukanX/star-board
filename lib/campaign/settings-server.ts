import { getCampaignRouteAccess } from "@/lib/campaign/server";
import { loadCampaignNarrativeSettings } from "@/lib/campaign/narrative-settings";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type CampaignSettingsResult = {
  role: "gm";
  displayName: string;
  narrativeSettings: {
    setting: string;
    styleTags: string[];
  };
  campaign: {
    name: string;
    description: string;
  };
};

export async function getCampaignSettings(campaignId: string): Promise<CampaignSettingsResult | null> {
  const access = await getCampaignRouteAccess(campaignId);
  if (!access || access.role !== "gm") return null;

  const supabase = await getSupabaseServerClient();
  const narrativeSettings = await loadCampaignNarrativeSettings(supabase, campaignId);
  if ("error" in narrativeSettings) throw new Error(narrativeSettings.error);

  return {
    role: "gm",
    displayName: access.displayName,
    narrativeSettings: narrativeSettings.settings,
    campaign: {
      name: access.campaign.name,
      description: access.campaign.description,
    },
  };
}