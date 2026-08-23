import NpcDetailRouteView from "@/components/npcs/NpcDetailRouteView";
import { getCampaignNpc } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { notFound } from "next/navigation";

export default async function NpcPage({ params }: { params: Promise<{ campaignId: string; npcId: string }> }) {
  const { campaignId, npcId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const resultPromise = getCampaignNpc(campaignId, npcId, placesPromise);
  const [placesResult, result] = await Promise.all([placesPromise, resultPromise]);
  if (!placesResult || !result) notFound();
  return <NpcDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialResult={result} />;
}