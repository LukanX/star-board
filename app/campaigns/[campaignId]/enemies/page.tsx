import EnemiesRouteView from "@/components/enemies/EnemiesRouteView";
import { getCampaignEnemies } from "@/lib/campaign/enemies-server";
import { notFound } from "next/navigation";

export default async function EnemiesPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignEnemies(campaignId);
  if (!result) notFound();
  return <EnemiesRouteView campaignId={campaignId} initialEnemies={result.enemies} role={result.role} />;
}
