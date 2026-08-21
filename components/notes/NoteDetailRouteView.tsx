"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import NoteEditor from "@/components/notes/NoteEditor";
import NotePublicRecord from "@/components/notes/NotePublicRecord";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { CampaignNoteResult } from "@/lib/campaign/notes-server";
import type { ApiCampaignNote, CampaignNoteEpisode } from "@/lib/campaign/types";

export default function NoteDetailRouteView({ campaignId, initialResult, episodes }: { campaignId: string; initialResult: CampaignNoteResult; episodes: CampaignNoteEpisode[] }) {
  const router = useRouter();
  const [note, setNote] = useState<ApiCampaignNote>(initialResult.note);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const episode = note.episode_id ? episodes.find((candidate) => candidate.id === note.episode_id) : undefined;

  const handleSaved = (savedNote: ApiCampaignNote) => {
    setNote(savedNote);
    setEditorOpen(false);
    setStatusMessage(`${savedNote.title} updated.`);
  };

  const handleDeleted = () => {
    router.push(campaignSectionPath(campaignId, "notes"));
  };

  return <><CampaignArtEditorSlot /><NotePublicRecord campaignId={campaignId} note={note} episode={episode} onEdit={note.permissions.canEdit ? () => { setError(null); setStatusMessage(null); setEditorOpen(true); } : undefined} />{error ? <p className="form-error" role="alert">{error}</p> : null}{statusMessage ? <p className="record-detail-meta" role="status">{statusMessage}</p> : null}{editorOpen ? <NoteEditor key={note.id} campaignId={campaignId} role={initialResult.role} episodes={episodes} note={note} onCancel={() => setEditorOpen(false)} onSaved={handleSaved} onDeleted={handleDeleted} /> : null}</>;
}