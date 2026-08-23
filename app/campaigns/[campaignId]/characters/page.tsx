import CharactersRouteView from "@/components/characters/CharactersRouteView";
import { getCampaignCharacters } from "@/lib/campaign/characters-server";
import { notFound } from "next/navigation";

export default async function CharactersPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignCharacters(campaignId);
  if (!result) notFound();
  return <CharactersRouteView campaignId={campaignId} initialCharacters={result.characters} />;
}