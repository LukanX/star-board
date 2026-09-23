"use client";

import { useState } from "react";
import { CirclePlus, FileText } from "lucide-react";
import NoteCard from "@/components/notes/NoteCard";
import NoteEditor from "@/components/notes/NoteEditor";
import EmptyState from "@/components/ui/EmptyState";
import type { CampaignNotesResult } from "@/lib/campaign/notes-server";
import { mapApiNote } from "@/lib/campaign/mappers";
import type { ApiCampaignNote, CampaignNoteEpisode } from "@/lib/campaign/types";
import type { NoteEntitySubject } from "@/lib/campaign/note-subject";

export default function EntityNotesPanel({
  campaignId,
  entity,
  entityLabel,
  initialResult,
  episodes = [],
}: {
  campaignId: string;
  entity: NoteEntitySubject;
  entityLabel: string;
  initialResult: CampaignNotesResult;
  episodes?: CampaignNoteEpisode[];
}) {
  const [notes, setNotes] = useState(() => initialResult.notes.map(mapApiNote));
  const [editingNote, setEditingNote] = useState<ApiCampaignNote | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeEditor = () => {
    setEditingNote(null);
    setEditorOpen(false);
  };

  const handleSaved = (savedNote: ApiCampaignNote) => {
    setNotes((current) => {
      const existingIndex = current.findIndex((note) => note.id === savedNote.id);
      if (existingIndex < 0) return [mapApiNote(savedNote, current.length), ...current];
      return current.map((note, index) => index === existingIndex ? mapApiNote(savedNote, index) : note);
    });
    closeEditor();
  };

  const handleDeleted = (noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    closeEditor();
  };

  return (
    <section className="mt-6 border-t border-[var(--line)] pt-5" aria-labelledby={`entity-notes-${entity.type}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 mb-1 text-[var(--cyan)] font-mono text-[8px] tracking-[.12em]">ATTACHED CAMPAIGN MEMORY</p>
          <h3 id={`entity-notes-${entity.type}`} className="m-0 text-[16px]">Notes on {entityLabel}</h3>
        </div>
        {!editorOpen ? (
          <button
            className="inline-flex h-8 items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(255,255,255,.035)] px-3 text-[var(--muted)] font-mono text-[8px] tracking-[.1em] hover:border-[var(--cyan)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)]"
            onClick={() => { setEditingNote(null); setError(null); setEditorOpen(true); }}
            type="button"
          >
            <CirclePlus aria-hidden="true" size={14} /> ADD NOTE
          </button>
        ) : null}
      </div>
      {editorOpen ? (
        <NoteEditor
          key={editingNote?.id ?? `${entity.type}-${entity.id}-new`}
          campaignId={campaignId}
          role={initialResult.role}
          episodes={episodes}
          entity={entity}
          note={editingNote ?? undefined}
          onCancel={closeEditor}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : notes.length ? (
        <div className="border border-[var(--line)] bg-[var(--panel)]">
          {notes.map((note) => (
            <NoteCard campaignId={campaignId} key={note.id} note={note} onEdit={() => { setEditingNote(note); setError(null); setEditorOpen(true); }} />
          ))}
        </div>
      ) : (
        <EmptyState icon={FileText} title="No notes attached yet." message="Add a note to keep campaign memory with this record." />
      )}
      {error ? <p className="mt-2 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
    </section>
  );
}