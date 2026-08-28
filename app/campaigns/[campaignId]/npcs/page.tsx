import NpcsRouteView from "@/components/npcs/NpcsRouteView";
import { getCampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { getCampaignNpcs } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function NpcsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [result, placesResult, affiliationsResult] = await Promise.all([
    getCampaignNpcs(campaignId),
    getCampaignPlaces(campaignId),
    getCampaignAffiliationContext(campaignId),
  ]);
  if (!result || !placesResult || !affiliationsResult) notFound();
  return <NpcsRouteView campaignId={campaignId} initialNpcs={result.npcs} initialPlaces={placesResult.places} initialAffiliations={affiliationsResult} role={result.role} />;
}