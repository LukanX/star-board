import FactionDetailRouteView from "@/components/factions/FactionDetailRouteView";
import { getCampaignFaction } from "@/lib/campaign/factions-server";
import { notFound } from "next/navigation";

export default async function FactionPage({ params }: { params: Promise<{ campaignId: string; factionId: string }> }) {
  const { campaignId, factionId } = await params;
  const result = await getCampaignFaction(campaignId, factionId);
  if (!result) notFound();
  return <FactionDetailRouteView campaignId={campaignId} initialResult={result} />;
}