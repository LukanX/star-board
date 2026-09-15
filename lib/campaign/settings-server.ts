import { getCampaignRouteAccess } from "@/lib/campaign/server";

export type CampaignSettingsResult = {
  role: "gm";
  displayName: string;
  campaign: {
    name: string;
    description: string;
  };
};

export async function getCampaignSettings(campaignId: string): Promise<CampaignSettingsResult | null> {
  const access = await getCampaignRouteAccess(campaignId);
  if (!access || access.role !== "gm") return null;

  return {
    role: "gm",
    displayName: access.displayName,
    campaign: {
      name: access.campaign.name,
      description: access.campaign.description,
    },
  };
}