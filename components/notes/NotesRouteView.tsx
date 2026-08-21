"use client";

import { useState } from "react";
import { CirclePlus, FileText, LockKeyhole } from "lucide-react";
import NoteCard from "@/components/notes/NoteCard";
import NoteEditor from "@/components/notes/NoteEditor";
import PageLayout from "@/components/ui/PageLayout";
import { mapApiNote } from "@/lib/campaign/mappers";
import type { CampaignNotesResult } from "@/lib/campaign/notes-server";
import type { CampaignNote, CampaignNoteEpisode } from "@/lib/campaign/types";

type NoteFilter = "all" | "global" | "episodes" | "gm";

export default function NotesRouteView({ campaignId, initialResult, episodes }: { campaignId: string; initialResult: CampaignNotesResult; episodes: CampaignNoteEpisode[] }) {
  const [notes, setNotes] = useState<CampaignNote[]>(() => initialResult.notes.map(mapApiNote));
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CampaignNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isGM = initialResult.role === "gm";
  const episodeTitles = new Map(episodes.map((episode) => [episode.id, episode.title]));

  const openEditor = (note?: CampaignNote) => {
    setEditingNote(note ?? null);
    setError(null);
    setStatusMessage(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingNote(null);
  };

  const handleSaved = (savedNote: Parameters<typeof mapApiNote>[0]) => {
    setNotes((current) => editingNote
      ? current.map((note) => note.id === editingNote.id ? mapApiNote(savedNote, current.indexOf(note)) : note)
      : [mapApiNote(savedNote, current.length), ...current]);
    closeEditor();
    setStatusMessage(editingNote ? `${savedNote.title} updated.` : `${savedNote.title} added to campaign memory.`);
  };

  const handleDeleted = (noteId: string) => {
    const deletedNote = notes.find((note) => note.id === noteId);
    setNotes((current) => current.filter((note) => note.id !== noteId));
    closeEditor();
    setStatusMessage(deletedNote ? `${deletedNote.title} removed from campaign memory.` : "Note removed from campaign memory.");
  };

  const filteredNotes = notes.filter((note) => {
    if (filter === "global") return note.episode_id === null;
    if (filter === "episodes") return note.episode_id !== null;
    if (filter === "gm") return note.visibility === "gm";
    return true;
  });
  const count = (scope: "all" | "global" | "episodes" | "gm") => {
    if (scope === "all") return notes.length.toString().padStart(2, "0");
    return notes.filter((note) => scope === "global" ? note.episode_id === null : scope === "episodes" ? note.episode_id !== null : note.visibility === "gm").length.toString().padStart(2, "0");
  };

  return <PageLayout eyebrow="CAMPAIGN LOG // SHARED MEMORY" title="Campaign notes" description="Global context and episode notes, with authorship and visibility kept visible." action="ADD NOTE" actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorOpen ? <NoteEditor key={editingNote?.id ?? "new-note"} campaignId={campaignId} role={initialResult.role} episodes={episodes} note={editingNote ?? undefined} onCancel={closeEditor} onSaved={handleSaved} onDeleted={handleDeleted} /> : null}
    {error ? <p className="form-error mb-3" role="alert">{error}</p> : null}
    {statusMessage ? <p className="record-detail-meta mb-3" role="status">{statusMessage}</p> : null}
    <div className="notes-toolbar"><div className="filter-tabs"><button className={`filter-tab ${filter === "all" ? "filter-tab-active" : ""}`} onClick={() => setFilter("all")} type="button">ALL NOTES <span>{count("all")}</span></button><button className={`filter-tab ${filter === "global" ? "filter-tab-active" : ""}`} onClick={() => setFilter("global")} type="button">GLOBAL <span>{count("global")}</span></button><button className={`filter-tab ${filter === "episodes" ? "filter-tab-active" : ""}`} onClick={() => setFilter("episodes")} type="button">EPISODES <span>{count("episodes")}</span></button></div>{isGM ? <button className={`visibility-toggle ${filter === "gm" ? "visibility-toggle-active" : ""}`} onClick={() => setFilter(filter === "gm" ? "all" : "gm")} type="button"><LockKeyhole size={14} /> GM ONLY <span>{count("gm")}</span></button> : null}</div>
    {filteredNotes.length ? <div className="notes-list">{filteredNotes.map((note) => <NoteCard campaignId={campaignId} episodeTitle={note.episode_id ? episodeTitles.get(note.episode_id) : undefined} key={note.id} note={note} />)}</div> : <div className="character-empty"><FileText size={22} /><h2>No notes in this view yet.</h2><p>{filter === "gm" ? "Private campaign memory will appear here for the GM." : "Record the next piece of campaign memory when it becomes important."}</p></div>}
  </PageLayout>;
}