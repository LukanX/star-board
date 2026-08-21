import NpcDetailRouteView from "@/components/npcs/NpcDetailRouteView";
import { getCampaignNpc } from "@/lib/campaign/npcs-server";
import { notFound } from "next/navigation";

export default async function NpcPage({ params }: { params: Promise<{ campaignId: string; npcId: string }> }) {
  const { campaignId, npcId } = await params;
  const result = await getCampaignNpc(campaignId, npcId);
  if (!result) notFound();
  return <NpcDetailRouteView campaignId={campaignId} initialResult={result} />;
}