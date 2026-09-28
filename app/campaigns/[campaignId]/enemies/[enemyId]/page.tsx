import EnemyDetailRouteView from "@/components/enemies/EnemyDetailRouteView";
import { getCampaignEnemy } from "@/lib/campaign/enemies-server";
import { getCampaignEntityNotes } from "@/lib/campaign/notes-server";
import { notFound } from "next/navigation";

export default async function EnemyPage({ params }: { params: Promise<{ campaignId: string; enemyId: string }> }) {
  const { campaignId, enemyId } = await params;
  const [result, entityNotes] = await Promise.all([
    getCampaignEnemy(campaignId, enemyId),
    getCampaignEntityNotes(campaignId, { type: "enemy", id: enemyId }),
  ]);
  if (!result || !entityNotes) notFound();
  return <EnemyDetailRouteView campaignId={campaignId} initialResult={result} entityNotes={entityNotes} />;
}
