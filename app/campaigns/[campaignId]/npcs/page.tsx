import NpcsRouteView from "@/components/npcs/NpcsRouteView";
import { getCampaignNpcs } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function NpcsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [result, placesResult] = await Promise.all([getCampaignNpcs(campaignId), getCampaignPlaces(campaignId)]);
  if (!result || !placesResult) notFound();
  return <NpcsRouteView campaignId={campaignId} initialNpcs={result.npcs} initialPlaces={placesResult.places} role={result.role} />;
}