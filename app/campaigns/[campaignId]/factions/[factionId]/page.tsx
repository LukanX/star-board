import FactionDetailRouteView from "@/components/factions/FactionDetailRouteView";
import { getCampaignFaction } from "@/lib/campaign/factions-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function FactionPage({ params }: { params: Promise<{ campaignId: string; factionId: string }> }) {
  const { campaignId, factionId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const resultPromise = getCampaignFaction(campaignId, factionId, placesPromise);
  const [placesResult, result] = await Promise.all([placesPromise, resultPromise]);
  if (!placesResult || !result) notFound();
  return <FactionDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialResult={result} />;
}