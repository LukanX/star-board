import { notFound } from "next/navigation";
import JobDetailRouteView from "@/components/jobs/JobDetailRouteView";
import { getCampaignJob } from "@/lib/campaign/jobs-server";
import { getCampaignFactions } from "@/lib/campaign/factions-server";
import { getCampaignNpcs } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { getCampaignEntityNotes } from "@/lib/campaign/notes-server";

export default async function JobPage({ params }: { params: Promise<{ campaignId: string; jobId: string }> }) {
  const { campaignId, jobId } = await params;
  const [jobResult, npcsResult, factionsResult, placesResult, entityNotes] = await Promise.all([
    getCampaignJob(campaignId, jobId),
    getCampaignNpcs(campaignId),
    getCampaignFactions(campaignId),
    getCampaignPlaces(campaignId),
    getCampaignEntityNotes(campaignId, { type: "job", id: jobId }),
  ]);

  if (!jobResult || !npcsResult || !factionsResult || !placesResult || !entityNotes) notFound();

  return <JobDetailRouteView campaignId={campaignId} initialResult={jobResult} initialNpcs={npcsResult.npcs} initialFactions={factionsResult.factions} initialPlaces={placesResult.places} entityNotes={entityNotes} />;
}