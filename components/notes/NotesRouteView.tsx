"use client";

import { useState } from "react";
import { CirclePlus, FileText, LockKeyhole } from "lucide-react";
import NoteCard from "@/components/notes/NoteCard";
import NoteEditor from "@/components/notes/NoteEditor";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import { recordDetailMetaClassName } from "@/components/ui/recordStyles";
import { mapApiNote } from "@/lib/campaign/mappers";
import type { CampaignNotesResult } from "@/lib/campaign/notes-server";
import type { CampaignNote, CampaignNoteEpisode } from "@/lib/campaign/types";

type NoteFilter = "all" | "global" | "episodes" | "gm";

export default function NotesRouteView({
  campaignId,
  initialResult,
  episodes,
}: {
  campaignId: string;
  initialResult: CampaignNotesResult;
  episodes: CampaignNoteEpisode[];
}) {
  const [notes, setNotes] = useState<CampaignNote[]>(() =>
    initialResult.notes.map(mapApiNote),
  );
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CampaignNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isGM = initialResult.role === "gm";
  const episodeTitles = new Map(
    episodes.map((episode) => [episode.id, episode.title]),
  );

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
    setNotes((current) =>
      editingNote
        ? current.map((note) =>
            note.id === editingNote.id
              ? mapApiNote(savedNote, current.indexOf(note))
              : note,
          )
        : [mapApiNote(savedNote, current.length), ...current],
    );
    closeEditor();
    setStatusMessage(
      editingNote
        ? `${savedNote.title} updated.`
        : `${savedNote.title} added to campaign memory.`,
    );
  };

  const handleDeleted = (noteId: string) => {
    const deletedNote = notes.find((note) => note.id === noteId);
    setNotes((current) => current.filter((note) => note.id !== noteId));
    closeEditor();
    setStatusMessage(
      deletedNote
        ? `${deletedNote.title} removed from campaign memory.`
        : "Note removed from campaign memory.",
    );
  };

  const filteredNotes = notes.filter((note) => {
    if (filter === "global") return note.episode_id === null;
    if (filter === "episodes") return note.episode_id !== null;
    if (filter === "gm") return note.visibility === "gm";
    return true;
  });
  const count = (scope: "all" | "global" | "episodes" | "gm") => {
    if (scope === "all") return notes.length.toString().padStart(2, "0");
    return notes
      .filter((note) =>
        scope === "global"
          ? note.episode_id === null
          : scope === "episodes"
            ? note.episode_id !== null
            : note.visibility === "gm",
      )
      .length.toString()
      .padStart(2, "0");
  };

  return (
    <PageLayout
      eyebrow="CAMPAIGN LOG // SHARED MEMORY"
      title="Campaign notes"
      description="Global context and episode notes, with authorship and visibility kept visible."
      action={editorOpen ? undefined : "ADD NOTE"}
      actionIcon={<CirclePlus size={16} />}
      onAction={() => openEditor()}
    >
      {editorOpen ? (
        <NoteEditor
          key={editingNote?.id ?? "new-note"}
          campaignId={campaignId}
          role={initialResult.role}
          episodes={episodes}
          note={editingNote ?? undefined}
          onCancel={closeEditor}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
      {error ? (
        <p className="m-0 mb-3 text-[var(--pink)] text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
      {!editorOpen && statusMessage ? (
        <p className={`${recordDetailMetaClassName} mb-3`} role="status">
          {statusMessage}
        </p>
      ) : null}
      {!editorOpen ? <div
        data-notes-toolbar="true"
        className="flex items-center justify-between gap-[15px] border-b border-[var(--line)] pb-[13px] mb-0 max-[760px]:items-start max-[760px]:flex-col"
      >
        <div
          data-notes-filter-tabs="true"
          className="flex items-center gap-[18px] max-[760px]:w-full max-[760px]:justify-between max-[760px]:gap-[6px]"
        >
          <button
            className={`inline-flex items-center gap-[6px] px-0 pb-[5px] border-0 border-b border-transparent bg-transparent text-[var(--dim)] font-mono text-[8px] tracking-[.12em] cursor-pointer [&>span]:text-[#5a6778] ${filter === "all" ? "border-[var(--cyan)] text-[var(--cyan)] [&>span]:text-[var(--cyan)]" : ""}`}
            onClick={() => setFilter("all")}
            type="button"
          >
            ALL NOTES <span>{count("all")}</span>
          </button>
          <button
            className={`inline-flex items-center gap-[6px] px-0 pb-[5px] border-0 border-b border-transparent bg-transparent text-[var(--dim)] font-mono text-[8px] tracking-[.12em] cursor-pointer [&>span]:text-[#5a6778] ${filter === "global" ? "border-[var(--cyan)] text-[var(--cyan)] [&>span]:text-[var(--cyan)]" : ""}`}
            onClick={() => setFilter("global")}
            type="button"
          >
            GLOBAL <span>{count("global")}</span>
          </button>
          <button
            className={`inline-flex items-center gap-[6px] px-0 pb-[5px] border-0 border-b border-transparent bg-transparent text-[var(--dim)] font-mono text-[8px] tracking-[.12em] cursor-pointer [&>span]:text-[#5a6778] ${filter === "episodes" ? "border-[var(--cyan)] text-[var(--cyan)] [&>span]:text-[var(--cyan)]" : ""}`}
            onClick={() => setFilter("episodes")}
            type="button"
          >
            EPISODES <span>{count("episodes")}</span>
          </button>
        </div>
        {isGM ? (
          <button
            className={`inline-flex items-center gap-[6px] h-[29px] px-[9px] border border-[rgba(255,92,154,.32)] bg-[rgba(255,92,154,.07)] text-[var(--pink)] font-mono text-[8px] tracking-[.1em] cursor-pointer ${filter === "gm" ? "border-[var(--pink)] bg-[rgba(255,92,154,.08)]" : ""}`}
            onClick={() => setFilter(filter === "gm" ? "all" : "gm")}
            type="button"
          >
            <LockKeyhole size={14} /> GM ONLY <span>{count("gm")}</span>
          </button>
        ) : null}
      </div> : null}
      {!editorOpen && filteredNotes.length ? (
        <div
          data-notes-list="true"
          className="border border-[var(--line)] bg-[var(--panel)]"
        >
          {filteredNotes.map((note) => (
            <NoteCard
              campaignId={campaignId}
              episodeTitle={
                note.episode_id ? episodeTitles.get(note.episode_id) : undefined
              }
              key={note.id}
              note={note}
            />
          ))}
        </div>
      ) : null}
      {!editorOpen && !filteredNotes.length ? (
        <EmptyState
          icon={FileText}
          title="No notes in this view yet."
          message={
            filter === "gm"
              ? "Private campaign memory will appear here for the GM."
              : "Record the next piece of campaign memory when it becomes important."
          }
        />
      ) : null}
    </PageLayout>
  );
}
