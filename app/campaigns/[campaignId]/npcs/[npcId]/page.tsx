import NpcDetailRouteView from "@/components/npcs/NpcDetailRouteView";
import { getCampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { getCampaignNpc } from "@/lib/campaign/npcs-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";
import { getCampaignEntityNotes } from "@/lib/campaign/notes-server";
import { notFound } from "next/navigation";

export default async function NpcPage({ params }: { params: Promise<{ campaignId: string; npcId: string }> }) {
  const { campaignId, npcId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const affiliationsPromise = getCampaignAffiliationContext(campaignId);
  const resultPromise = getCampaignNpc(campaignId, npcId, placesPromise, affiliationsPromise);
  const notesPromise = getCampaignEntityNotes(campaignId, { type: "npc", id: npcId });
  const [placesResult, affiliationsResult, result, entityNotes] = await Promise.all([placesPromise, affiliationsPromise, resultPromise, notesPromise]);
  if (!placesResult || !affiliationsResult || !result || !entityNotes) notFound();
  return <NpcDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialAffiliations={affiliationsResult} initialResult={result} entityNotes={entityNotes} />;
}