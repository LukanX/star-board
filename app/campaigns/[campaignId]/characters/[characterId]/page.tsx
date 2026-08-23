import CharacterDetailRouteView from "@/components/characters/CharacterDetailRouteView";
import { getCampaignCharacter } from "@/lib/campaign/characters-server";
import { notFound } from "next/navigation";

export default async function CharacterPage({ params }: { params: Promise<{ campaignId: string; characterId: string }> }) {
  const { campaignId, characterId } = await params;
  const character = await getCampaignCharacter(campaignId, characterId);
  if (!character) notFound();
  return <CharacterDetailRouteView campaignId={campaignId} initialCharacter={character} />;
}