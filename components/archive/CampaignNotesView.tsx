"use client";

import { useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { BookOpen, ChevronRight, CirclePlus, FileText, LockKeyhole, X } from "lucide-react";
export type { ApiCampaignNote, CampaignNote, CampaignNoteEpisode, NoteAccent, NoteVisibility } from "@/lib/campaign/types";
import type { ApiCampaignNote, CampaignNote, CampaignNoteEpisode, NoteAccent, NoteVisibility } from "@/lib/campaign/types";

type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  visibility: NoteVisibility;
  episodeId: string | null;
};

type Props = {
  notes: CampaignNote[];
  campaignId: string | null;
  isGM: boolean;
  episodes: CampaignNoteEpisode[];
  onNotesChange: Dispatch<SetStateAction<CampaignNote[]>>;
  onAction: (message: string) => void;
};

const emptyDraft: NoteDraft = { title: "", bodyMarkdown: "", visibility: "player", episodeId: null };
const accents: NoteAccent[] = ["cyan", "pink", "amber", "purple"];

function noteAge(note: CampaignNote) {
  if (note.age) return note.age;
  const timestamp = Date.parse(note.updated_at || note.created_at);
  if (Number.isNaN(timestamp)) return "recently";
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function normalizeNote(note: ApiCampaignNote, existing: CampaignNote | undefined, index: number): CampaignNote {
  return { ...note, accent: existing?.accent ?? accents[index % accents.length], age: existing?.age };
}

export default function CampaignNotesView({ notes, campaignId, isGM, episodes, onNotesChange, onAction }: Props) {
  const [filter, setFilter] = useState<"all" | "global" | "episodes" | "gm">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CampaignNote | null>(null);
  const [selectedNote, setSelectedNote] = useState<CampaignNote | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredNotes = notes.filter((note) => {
    if (filter === "global") return note.episode_id === null;
    if (filter === "episodes") return note.episode_id !== null;
    if (filter === "gm") return note.visibility === "gm";
    return true;
  });

  const openEditor = (note?: CampaignNote) => {
    setEditingNote(note ?? null);
    setSelectedNote(note ?? null);
    setDraft(note ? { title: note.title, bodyMarkdown: note.body_markdown, visibility: note.visibility, episodeId: note.episode_id } : emptyDraft);
    setError(null);
    setEditorOpen(true);
  };

  const saveNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notes${editingNote ? `/${encodeURIComponent(editingNote.id)}` : ""}`, {
        method: editingNote ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; note?: ApiCampaignNote };
      if (!response.ok || !result.note) throw new Error(result.error ?? "Campaign note could not be saved.");

      const saved = normalizeNote(result.note, editingNote ?? undefined, notes.length);
      onNotesChange((current) => editingNote ? current.map((note) => note.id === editingNote.id ? normalizeNote(result.note!, note, current.indexOf(note)) : note) : [saved, ...current]);
      setSelectedNote(saved);
      setEditorOpen(false);
      setEditingNote(null);
      onAction(editingNote ? `${result.note.title} updated.` : `${result.note.title} added to campaign memory.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Campaign note could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = async () => {
    if (!campaignId || !editingNote || !window.confirm(`Delete ${editingNote.title}?`)) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notes/${encodeURIComponent(editingNote.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Campaign note could not be deleted.");
      onNotesChange((current) => current.filter((note) => note.id !== editingNote.id));
      setSelectedNote(null);
      setEditingNote(null);
      setEditorOpen(false);
      onAction(`${editingNote.title} removed from campaign memory.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Campaign note could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <PageLayout eyebrow="CAMPAIGN LOG // SHARED MEMORY" title="Campaign notes" description="Global context and episode notes, with authorship and visibility kept visible." action="ADD NOTE" onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">{isGM ? "GM / PLAYER NOTE" : "PLAYER NOTE"}</p><h2>{editingNote ? `Edit ${editingNote.title}` : "Add a campaign note"}</h2></div><button className="icon-button" aria-label="Close note editor" onClick={() => setEditorOpen(false)} title="Close note editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveNote}><label>Title<input required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Note body<textarea maxLength={20000} placeholder="Record what the campaign should remember." value={draft.bodyMarkdown} onChange={(event) => setDraft((current) => ({ ...current, bodyMarkdown: event.target.value }))} /></label><label>Episode<select value={draft.episodeId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, episodeId: event.target.value || null }))}><option value="">Global campaign note</option>{episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title} ({episode.status})</option>)}</select></label>{isGM ? <label className="note-visibility-toggle"><input type="checkbox" checked={draft.visibility === "gm"} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.checked ? "gm" : "player" }))} /><span><LockKeyhole size={13} /> GM ONLY</span></label> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingNote ? "SAVE CHANGES" : "ADD NOTE"}</button>{editingNote?.permissions.canDelete ? <button className="button button-danger" disabled={isSaving} onClick={deleteNote} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    <div className="notes-toolbar"><div className="filter-tabs"><button className={`filter-tab ${filter === "all" ? "filter-tab-active" : ""}`} onClick={() => setFilter("all")} type="button">ALL NOTES <span>{notes.length.toString().padStart(2, "0")}</span></button><button className={`filter-tab ${filter === "global" ? "filter-tab-active" : ""}`} onClick={() => setFilter("global")} type="button">GLOBAL</button><button className={`filter-tab ${filter === "episodes" ? "filter-tab-active" : ""}`} onClick={() => setFilter("episodes")} type="button">EPISODES</button></div>{isGM ? <button className={`visibility-toggle ${filter === "gm" ? "visibility-toggle-active" : ""}`} onClick={() => setFilter(filter === "gm" ? "all" : "gm")} type="button"><LockKeyhole size={14} /> GM ONLY</button> : null}</div>
    {filteredNotes.length ? <div className="notes-list">{filteredNotes.map((note) => <article className="note-row" key={note.id}><span className={`accent-mark accent-${note.accent}`} /><div className="note-main"><div className="note-meta"><span>{note.episode_id ? "EPISODE" : "GLOBAL"}</span><span className={`note-visibility ${note.visibility === "gm" ? "note-private" : ""}`}>{note.visibility === "gm" ? <LockKeyhole size={12} /> : <BookOpen size={12} />} {note.visibility === "gm" ? "GM ONLY" : "PLAYER"}</span></div><h3>{note.title}</h3><p>Added by <strong>{note.author.displayName}</strong> <span className="meta-divider" /> {noteAge(note)}</p></div><button className="icon-button" aria-label={`Open note ${note.title}`} onClick={() => note.permissions.canEdit ? openEditor(note) : setSelectedNote(note)} title={note.permissions.canEdit ? `Edit ${note.title}` : `Open ${note.title}`} type="button"><ChevronRight size={17} /></button></article>)}</div> : <div className="character-empty"><FileText size={22} /><h2>No notes in this view yet.</h2><p>Record the next piece of campaign memory when it becomes important.</p></div>}
    {selectedNote && !editorOpen ? <section className="record-detail"><div><p className="eyebrow">{selectedNote.visibility === "gm" ? "GM NOTE" : "PLAYER NOTE"}</p><h2>{selectedNote.title}</h2><p className="record-detail-meta">Added by {selectedNote.author.displayName}</p></div><p>{selectedNote.body_markdown || "No note body recorded yet."}</p>{selectedNote.permissions.canEdit ? <button className="text-action" onClick={() => openEditor(selectedNote)} type="button">EDIT NOTE <ChevronRight size={14} /></button> : null}</section> : null}
  </PageLayout>;
}

function PageLayout({ eyebrow, title, description, action, onAction, children }: { eyebrow: string; title: string; description: string; action?: string; onAction: () => void; children: React.ReactNode }) { return <><div className="page-intro"><div><p className="eyebrow eyebrow-bright">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action ? <button className="button button-primary" onClick={onAction} type="button"><CirclePlus size={16} /> {action}</button> : null}</div>{children}</>; }