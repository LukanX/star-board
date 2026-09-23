import CharacterDetailRouteView from "@/components/characters/CharacterDetailRouteView";
import { getCampaignCharacter } from "@/lib/campaign/characters-server";
import { getCampaignMembers } from "@/lib/campaign/members-server";
import { getCampaignEntityNotes } from "@/lib/campaign/notes-server";
import { notFound } from "next/navigation";

export default async function CharacterPage({ params }: { params: Promise<{ campaignId: string; characterId: string }> }) {
  const { campaignId, characterId } = await params;
  const [character, members, entityNotes] = await Promise.all([
    getCampaignCharacter(campaignId, characterId),
    getCampaignMembers(campaignId),
    getCampaignEntityNotes(campaignId, { type: "character", id: characterId }),
  ]);
  if (!character || !members || !entityNotes) notFound();
  return <CharacterDetailRouteView campaignId={campaignId} currentUserId={members.currentUserId} initialCharacter={character} members={members.members} role={members.role} entityNotes={entityNotes} />;
}