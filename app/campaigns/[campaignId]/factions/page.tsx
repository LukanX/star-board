import FactionsRouteView from "@/components/factions/FactionsRouteView";
import { getCampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { getCampaignFactions } from "@/lib/campaign/factions-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function FactionsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [result, placesResult, affiliationsResult] = await Promise.all([
    getCampaignFactions(campaignId),
    getCampaignPlaces(campaignId),
    getCampaignAffiliationContext(campaignId),
  ]);
  if (!result || !placesResult || !affiliationsResult) notFound();
  return <FactionsRouteView campaignId={campaignId} initialFactions={result.factions} initialPlaces={placesResult.places} initialAffiliations={affiliationsResult} role={result.role} />;
}