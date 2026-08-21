"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CirclePlus, LockKeyhole, Trash2, X } from "lucide-react";
import type { ApiCampaignNote, CampaignNoteEpisode, NoteVisibility } from "@/lib/campaign/types";

type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  visibility: NoteVisibility;
  episodeId: string | null;
};

const emptyDraft: NoteDraft = { title: "", bodyMarkdown: "", visibility: "player", episodeId: null };

function toDraft(note?: ApiCampaignNote): NoteDraft {
  return note ? { title: note.title, bodyMarkdown: note.body_markdown, visibility: note.visibility, episodeId: note.episode_id } : { ...emptyDraft };
}

export default function NoteEditor({ campaignId, role, episodes, note, onCancel, onSaved, onDeleted }: {
  campaignId: string;
  role: "gm" | "player";
  episodes: CampaignNoteEpisode[];
  note?: ApiCampaignNote;
  onCancel: () => void;
  onSaved: (note: ApiCampaignNote) => void;
  onDeleted?: (noteId: string) => void;
}) {
  const [draft, setDraft] = useState<NoteDraft>(() => toDraft(note));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGM = role === "gm";

  const update = <Field extends keyof NoteDraft>(field: Field, value: NoteDraft[Field]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const path = `/api/campaigns/${encodeURIComponent(campaignId)}/notes${note ? `/${encodeURIComponent(note.id)}` : ""}`;
      const response = await fetch(path, {
        method: note ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; note?: ApiCampaignNote };
      if (!response.ok || !result.note) throw new Error(result.error ?? "Campaign note could not be saved.");
      onSaved(result.note);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Campaign note could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!note || !onDeleted || isSaving || !window.confirm(`Delete ${note.title}?`)) return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notes/${encodeURIComponent(note.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Campaign note could not be deleted.");
      onDeleted(note.id);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Campaign note could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="character-editor">
    <div className="editor-heading">
      <div><p className="eyebrow">{isGM ? "GM / PLAYER NOTE" : "PLAYER NOTE"}</p><h2>{note ? `Edit ${note.title}` : "Add a campaign note"}</h2></div>
      <button aria-label="Close note editor" className="icon-button" disabled={isSaving} onClick={onCancel} title="Close note editor" type="button"><X size={17} /></button>
    </div>
    <form className="character-form" onSubmit={save}>
      <label>Title<input required maxLength={160} value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
      <label>Note body<textarea maxLength={20000} placeholder="Record what the campaign should remember." value={draft.bodyMarkdown} onChange={(event) => update("bodyMarkdown", event.target.value)} /></label>
      <label>Episode<select value={draft.episodeId ?? ""} onChange={(event) => update("episodeId", event.target.value || null)}><option value="">Global campaign note</option>{episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title} ({episode.status})</option>)}</select></label>
      {isGM ? <label className="note-visibility-toggle"><input checked={draft.visibility === "gm"} onChange={(event) => update("visibility", event.target.checked ? "gm" : "player")} type="checkbox" /><span><LockKeyhole size={13} /> GM ONLY</span></label> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : note ? "SAVE CHANGES" : "ADD NOTE"}</button>{note?.permissions.canDelete && onDeleted ? <button className="button button-danger" disabled={isSaving} onClick={() => void remove()} type="button"><Trash2 size={14} /> REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={onCancel} type="button">CANCEL</button></div>
    </form>
  </section>;
}