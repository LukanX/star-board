import { notFound } from "next/navigation";
import EpisodesRouteView from "@/components/episodes/EpisodesRouteView";
import { getCampaignEpisodes } from "@/lib/campaign/episodes-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";

export default async function EpisodesPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [episodesResult, placesResult] = await Promise.all([getCampaignEpisodes(campaignId), getCampaignPlaces(campaignId)]);

  if (!episodesResult || !placesResult) notFound();

  return <EpisodesRouteView campaignId={campaignId} episodes={episodesResult.episodes} places={placesResult.places} />;
}