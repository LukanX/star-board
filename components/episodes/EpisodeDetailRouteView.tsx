import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import EpisodePublicRecord from "@/components/episodes/EpisodePublicRecord";
import { mapApiEpisode } from "@/lib/campaign/mappers";
import type { CampaignEpisodeResult } from "@/lib/campaign/episodes-server";
import type { ApiPlace } from "@/lib/campaign/types";

export default function EpisodeDetailRouteView({ campaignId, initialResult, places }: { campaignId: string; initialResult: CampaignEpisodeResult; places: ApiPlace[] }) {
  return <><CampaignArtEditorSlot /><EpisodePublicRecord campaignId={campaignId} episode={mapApiEpisode(initialResult.episode, 0)} notes={initialResult.notes} places={places} /></>;
}