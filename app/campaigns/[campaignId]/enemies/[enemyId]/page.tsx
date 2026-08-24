import EnemyDetailRouteView from "@/components/enemies/EnemyDetailRouteView";
import { getCampaignEnemy } from "@/lib/campaign/enemies-server";
import { notFound } from "next/navigation";

export default async function EnemyPage({ params }: { params: Promise<{ campaignId: string; enemyId: string }> }) {
  const { campaignId, enemyId } = await params;
  const result = await getCampaignEnemy(campaignId, enemyId);
  if (!result) notFound();
  return <EnemyDetailRouteView campaignId={campaignId} initialResult={result} />;
}
