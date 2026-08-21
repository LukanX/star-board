import { notFound } from "next/navigation";
import JobsRouteView from "@/components/jobs/JobsRouteView";
import { getCampaignJobs } from "@/lib/campaign/jobs-server";
import { getCampaignFactions } from "@/lib/campaign/factions-server";
import { getCampaignNpcs } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";

export default async function JobsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [jobsResult, npcsResult, factionsResult, placesResult] = await Promise.all([
    getCampaignJobs(campaignId),
    getCampaignNpcs(campaignId),
    getCampaignFactions(campaignId),
    getCampaignPlaces(campaignId),
  ]);

  if (!jobsResult || !npcsResult || !factionsResult || !placesResult) notFound();

  return <JobsRouteView campaignId={campaignId} role={jobsResult.role} initialJobs={jobsResult.jobs} initialNpcs={npcsResult.npcs} initialFactions={factionsResult.factions} initialPlaces={placesResult.places} />;
}