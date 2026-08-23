import FactionsRouteView from "@/components/factions/FactionsRouteView";
import { getCampaignFactions } from "@/lib/campaign/factions-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function FactionsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [result, placesResult] = await Promise.all([getCampaignFactions(campaignId), getCampaignPlaces(campaignId)]);
  if (!result || !placesResult) notFound();
  return <FactionsRouteView campaignId={campaignId} initialFactions={result.factions} initialPlaces={placesResult.places} role={result.role} />;
}