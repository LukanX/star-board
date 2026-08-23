import { notFound } from "next/navigation";
import JobDetailRouteView from "@/components/jobs/JobDetailRouteView";
import { getCampaignJob } from "@/lib/campaign/jobs-server";
import { getCampaignFactions } from "@/lib/campaign/factions-server";
import { getCampaignNpcs } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";

export default async function JobPage({ params }: { params: Promise<{ campaignId: string; jobId: string }> }) {
  const { campaignId, jobId } = await params;
  const [jobResult, npcsResult, factionsResult, placesResult] = await Promise.all([
    getCampaignJob(campaignId, jobId),
    getCampaignNpcs(campaignId),
    getCampaignFactions(campaignId),
    getCampaignPlaces(campaignId),
  ]);

  if (!jobResult || !npcsResult || !factionsResult || !placesResult) notFound();

  return <JobDetailRouteView campaignId={campaignId} initialResult={jobResult} initialNpcs={npcsResult.npcs} initialFactions={factionsResult.factions} initialPlaces={placesResult.places} />;
}