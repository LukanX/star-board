import type { ApiJob } from "@/lib/campaign/types";

export type CampaignJobsClientResult = {
  role: "gm" | "player";
  displayName: string;
  jobs: ApiJob[];
};

export async function fetchCampaignJobs(campaignId: string): Promise<CampaignJobsClientResult> {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs`);
  const result = (await response.json().catch(() => ({}))) as { error?: string; role?: "gm" | "player"; displayName?: string; jobs?: ApiJob[] };

  if (!response.ok) throw new Error(result.error ?? "Unable to load campaign jobs.");

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", jobs: result.jobs ?? [] };
}