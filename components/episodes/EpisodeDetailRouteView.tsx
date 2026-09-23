"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import EpisodeEditor from "@/components/episodes/EpisodeEditor";
import EpisodePublicRecord from "@/components/episodes/EpisodePublicRecord";
import NoteEditor from "@/components/notes/NoteEditor";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { mapApiEpisode } from "@/lib/campaign/mappers";
import type { CampaignEpisodeResult } from "@/lib/campaign/episodes-server";
import type { ApiCampaignNote, ApiEpisode, ApiPlace, EpisodeNote } from "@/lib/campaign/types";

export default function EpisodeDetailRouteView({ campaignId, initialResult, places }: { campaignId: string; initialResult: CampaignEpisodeResult; places: ApiPlace[] }) {
  const router = useRouter();
  const [episode, setEpisode] = useState<ApiEpisode>(initialResult.episode);
  const [editorOpen, setEditorOpen] = useState(false);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [notes, setNotes] = useState<EpisodeNote[]>(initialResult.notes);
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

  const handleNoteSaved = (savedNote: ApiCampaignNote) => {
    const episodeNote: EpisodeNote = {
      id: savedNote.id,
      title: savedNote.title,
      body_markdown: savedNote.body_markdown,
      visibility: savedNote.visibility,
      author_id: savedNote.author_id,
      created_at: savedNote.created_at,
      updated_at: savedNote.updated_at,
      revision: savedNote.revision,
      author: savedNote.author,
      permissions: {
        canEdit: savedNote.permissions.canEdit,
        canDelete: savedNote.permissions.canDelete,
      },
    };
    setNotes((current) => [episodeNote, ...current.filter((note) => note.id !== episodeNote.id)]);
    setNoteEditorOpen(false);
  };

  return (
    <>
      <CampaignArtEditorSlot />
      {editorOpen ? (
        <EpisodeEditor
          key={episode.id}
          campaignId={campaignId}
          episode={episode}
          places={places}
          onCancel={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      ) : noteEditorOpen ? (
        <NoteEditor
          campaignId={campaignId}
          role={initialResult.role}
          episodes={[{ id: episode.id, title: episode.title, status: episode.status }]}
          initialEpisodeId={episode.id}
          fixedEpisodeId={episode.id}
          onCancel={() => setNoteEditorOpen(false)}
          onSaved={handleNoteSaved}
        />
      ) : (
        <>
          <EpisodePublicRecord
            campaignId={campaignId}
            episode={mapApiEpisode(episode, 0)}
            notes={notes}
            places={places}
            onAddNote={() => setNoteEditorOpen(true)}
            actions={isGM ? <RecordEditAction recordName={episode.title} disabled={isDeleting} onClick={() => { setError(null); setEditorOpen(true); }} /> : null}
          />
          {isGM ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><RecordDeleteAction recordName={episode.title} disabled={isDeleting} onClick={() => void deleteEpisode()} /></div> : null}
        </>
      )}
      {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
    </>
  );
}