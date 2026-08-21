import NpcsRouteView from "@/components/npcs/NpcsRouteView";
import { getCampaignNpcs } from "@/lib/campaign/npcs-server";
import { notFound } from "next/navigation";

export default async function NpcsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignNpcs(campaignId);
  if (!result) notFound();
  return <NpcsRouteView campaignId={campaignId} initialNpcs={result.npcs} role={result.role} />;
}