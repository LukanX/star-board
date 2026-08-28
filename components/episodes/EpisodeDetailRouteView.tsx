"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import EpisodeEditor from "@/components/episodes/EpisodeEditor";
import EpisodePublicRecord from "@/components/episodes/EpisodePublicRecord";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { mapApiEpisode } from "@/lib/campaign/mappers";
import type { CampaignEpisodeResult } from "@/lib/campaign/episodes-server";
import type { ApiEpisode, ApiPlace } from "@/lib/campaign/types";

export default function EpisodeDetailRouteView({ campaignId, initialResult, places }: { campaignId: string; initialResult: CampaignEpisodeResult; places: ApiPlace[] }) {
  const router = useRouter();
  const [episode, setEpisode] = useState<ApiEpisode>(initialResult.episode);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGM = initialResult.role === "gm";

  const deleteEpisode = async () => {
    if (!isGM || isDeleting || !window.confirm(`Delete ${episode.title} from the episode log?`)) return;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/episodes/${encodeURIComponent(episode.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Campaign episode could not be deleted.");
      router.push(campaignSectionPath(campaignId, "episodes"));
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Campaign episode could not be deleted.");
      setIsDeleting(false);
    }
  };

  const handleSaved = (savedEpisode: ApiEpisode) => {
    setEpisode(savedEpisode);
    setEditorOpen(false);
  };

  return <><CampaignArtEditorSlot />{editorOpen ? <EpisodeEditor key={episode.id} campaignId={campaignId} episode={episode} places={places} onCancel={() => setEditorOpen(false)} onSaved={handleSaved} /> : <><EpisodePublicRecord campaignId={campaignId} episode={mapApiEpisode(episode, 0)} notes={initialResult.notes} places={places} actions={isGM ? <RecordEditAction recordName={episode.title} disabled={isDeleting} onClick={() => { setError(null); setEditorOpen(true); }} /> : null} />{isGM ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><RecordDeleteAction recordName={episode.title} disabled={isDeleting} onClick={() => void deleteEpisode()} /></div> : null}</>}{error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}</>;
}