import { notFound } from "next/navigation";
import EpisodeDetailRouteView from "@/components/episodes/EpisodeDetailRouteView";
import { getCampaignEpisode } from "@/lib/campaign/episodes-server";
import { getCampaignPlaces } from "@/lib/campaign/places-server";

export default async function EpisodePage({ params }: { params: Promise<{ campaignId: string; episodeId: string }> }) {
  const { campaignId, episodeId } = await params;
  const [episodeResult, placesResult] = await Promise.all([getCampaignEpisode(campaignId, episodeId), getCampaignPlaces(campaignId)]);

  if (!episodeResult || !placesResult) notFound();

  return <EpisodeDetailRouteView campaignId={campaignId} initialResult={episodeResult} places={placesResult.places} />;
}