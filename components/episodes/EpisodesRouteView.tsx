import { FolderKanban } from "lucide-react";
import EpisodeCard from "@/components/episodes/EpisodeCard";
import PageLayout from "@/components/ui/PageLayout";
import { mapApiEpisode } from "@/lib/campaign/mappers";
import type { CampaignEpisode } from "@/lib/campaign/episodes-server";
import type { ApiPlace } from "@/lib/campaign/types";

export default function EpisodesRouteView({ campaignId, episodes, places }: { campaignId: string; episodes: CampaignEpisode[]; places: ApiPlace[] }) {
  const episodeRecords = episodes.map(mapApiEpisode);

  return <PageLayout eyebrow="CAMPAIGN LOG // EPISODES" title="Episodes" description="The campaign record, one transmission at a time.">
    {episodeRecords.length ? <div className="episode-list">{episodeRecords.map((episode, index) => <EpisodeCard campaignId={campaignId} episode={episode} index={index} key={episode.id} places={places} />)}</div> : <div className="character-empty"><FolderKanban size={22} /><h2>No episodes logged yet.</h2><p>Promote an open job when the crew is ready to make it part of the campaign record.</p></div>}
  </PageLayout>;
}