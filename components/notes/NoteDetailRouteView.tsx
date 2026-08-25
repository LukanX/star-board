"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import NoteEditor from "@/components/notes/NoteEditor";
import NotePublicRecord from "@/components/notes/NotePublicRecord";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import { recordDetailMetaClassName } from "@/components/ui/recordStyles";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { CampaignNoteResult } from "@/lib/campaign/notes-server";
import type {
  ApiCampaignNote,
  CampaignNoteEpisode,
} from "@/lib/campaign/types";

export default function NoteDetailRouteView({
  campaignId,
  initialResult,
  episodes,
}: {
  campaignId: string;
  initialResult: CampaignNoteResult;
  episodes: CampaignNoteEpisode[];
}) {
  const router = useRouter();
  const [note, setNote] = useState<ApiCampaignNote>(initialResult.note);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const episode = note.episode_id
    ? episodes.find((candidate) => candidate.id === note.episode_id)
    : undefined;

  const handleSaved = (savedNote: ApiCampaignNote) => {
    setNote(savedNote);
    setEditorOpen(false);
    setStatusMessage(`${savedNote.title} updated.`);
  };

  const handleDeleted = () => {
    router.push(campaignSectionPath(campaignId, "notes"));
  };

  const deleteNote = async () => {
    if (!note.permissions.canDelete || isDeleting || !window.confirm(`Delete ${note.title} from this campaign?`)) return;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notes/${encodeURIComponent(note.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Campaign note could not be deleted.");
      router.push(campaignSectionPath(campaignId, "notes"));
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Campaign note could not be deleted.");
      setIsDeleting(false);
    }
  };

  return (
    <>
      <CampaignArtEditorSlot />
      {!editorOpen ? <NotePublicRecord
        campaignId={campaignId}
        note={note}
        episode={episode}
        actions={note.permissions.canEdit ? <RecordEditAction recordName={note.title} disabled={isDeleting} onClick={() => { setError(null); setStatusMessage(null); setEditorOpen(true); }} /> : null}
      /> : null}
      {!editorOpen && note.permissions.canDelete ? (
        <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
          <RecordDeleteAction recordName={note.title} disabled={isDeleting} onClick={() => void deleteNote()} />
        </div>
      ) : null}
      {error ? (
        <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
      {!editorOpen && statusMessage ? (
        <p className={recordDetailMetaClassName} role="status">
          {statusMessage}
        </p>
      ) : null}
      {editorOpen ? (
        <NoteEditor
          key={note.id}
          campaignId={campaignId}
          role={initialResult.role}
          episodes={episodes}
          note={note}
          onCancel={() => setEditorOpen(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </>
  );
}
