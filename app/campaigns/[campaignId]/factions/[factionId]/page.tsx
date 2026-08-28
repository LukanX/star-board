import FactionDetailRouteView from "@/components/factions/FactionDetailRouteView";
import { getCampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { getCampaignFaction } from "@/lib/campaign/factions-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function FactionPage({ params }: { params: Promise<{ campaignId: string; factionId: string }> }) {
  const { campaignId, factionId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const affiliationsPromise = getCampaignAffiliationContext(campaignId);
  const resultPromise = getCampaignFaction(campaignId, factionId, placesPromise, affiliationsPromise);
  const [placesResult, affiliationsResult, result] = await Promise.all([placesPromise, affiliationsPromise, resultPromise]);
  if (!placesResult || !affiliationsResult || !result) notFound();
  return <FactionDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialAffiliations={affiliationsResult} initialResult={result} />;
}