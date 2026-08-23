import type { ApiPlace } from "@/lib/campaign/types";

export async function fetchCampaignPlaces(campaignId: string): Promise<ApiPlace[]> {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places`);
  const result = (await response.json().catch(() => ({}))) as { error?: string; places?: ApiPlace[] };

  if (!response.ok) throw new Error(result.error ?? "Unable to load campaign places.");
  return result.places ?? [];
}