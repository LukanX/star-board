import CharactersRouteView from "@/components/characters/CharactersRouteView";
import { getCampaignCharacters } from "@/lib/campaign/characters-server";
import { getCampaignMembers } from "@/lib/campaign/members-server";
import { notFound } from "next/navigation";

export default async function CharactersPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [result, members] = await Promise.all([getCampaignCharacters(campaignId), getCampaignMembers(campaignId)]);
  if (!result || !members) notFound();
  return <CharactersRouteView campaignId={campaignId} currentUserId={members.currentUserId} initialCharacters={result.characters} members={members.members} role={members.role} />;
}