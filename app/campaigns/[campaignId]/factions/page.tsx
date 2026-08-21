import FactionsRouteView from "@/components/factions/FactionsRouteView";
import { getCampaignFactions } from "@/lib/campaign/factions-server";
import { notFound } from "next/navigation";

export default async function FactionsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignFactions(campaignId);
  if (!result) notFound();
  return <FactionsRouteView campaignId={campaignId} initialFactions={result.factions} role={result.role} />;
}