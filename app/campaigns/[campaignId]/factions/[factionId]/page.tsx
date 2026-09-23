import FactionDetailRouteView from "@/components/factions/FactionDetailRouteView";
import { getCampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { getCampaignFaction } from "@/lib/campaign/factions-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { getCampaignEntityNotes } from "@/lib/campaign/notes-server";
import { notFound } from "next/navigation";

export default async function FactionPage({ params }: { params: Promise<{ campaignId: string; factionId: string }> }) {
  const { campaignId, factionId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const affiliationsPromise = getCampaignAffiliationContext(campaignId);
  const resultPromise = getCampaignFaction(campaignId, factionId, placesPromise, affiliationsPromise);
  const notesPromise = getCampaignEntityNotes(campaignId, { type: "faction", id: factionId });
  const [placesResult, affiliationsResult, result, entityNotes] = await Promise.all([placesPromise, affiliationsPromise, resultPromise, notesPromise]);
  if (!placesResult || !affiliationsResult || !result || !entityNotes) notFound();
  return <FactionDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialAffiliations={affiliationsResult} initialResult={result} entityNotes={entityNotes} />;
}