"use client";

import { useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import EmptyState from "@/components/ui/EmptyState";
import {
  recordDetailClassName,
  recordDetailMetaClassName,
} from "@/components/ui/recordStyles";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import {
  eyebrowBrightClassName,
  eyebrowClassName,
  metaDividerClassName,
} from "@/components/ui/terminalStyles";
import {
  BookOpen,
  ChevronRight,
  CirclePlus,
  FileText,
  LockKeyhole,
  X,
} from "lucide-react";
export type {
  ApiCampaignNote,
  CampaignNote,
  CampaignNoteEpisode,
  NoteAccent,
  NoteVisibility,
} from "@/lib/campaign/types";
import type {
  ApiCampaignNote,
  CampaignNote,
  CampaignNoteEpisode,
  NoteAccent,
  NoteVisibility,
} from "@/lib/campaign/types";

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

const emptyDraft: NoteDraft = {
  title: "",
  bodyMarkdown: "",
  visibility: "player",
  episodeId: null,
};
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

function normalizeNote(
  note: ApiCampaignNote,
  existing: CampaignNote | undefined,
  index: number,
): CampaignNote {
  return {
    ...note,
    accent: existing?.accent ?? accents[index % accents.length],
    age: existing?.age,
  };
}

export default function CampaignNotesView({
  notes,
  campaignId,
  isGM,
  episodes,
  onNotesChange,
  onAction,
}: Props) {
  const [filter, setFilter] = useState<"all" | "global" | "episodes" | "gm">(
    "all",
  );
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
    setDraft(
      note
        ? {
            title: note.title,
            bodyMarkdown: note.body_markdown,
            visibility: note.visibility,
            episodeId: note.episode_id,
          }
        : emptyDraft,
    );
    setError(null);
    setEditorOpen(true);
  };

  const saveNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/notes${editingNote ? `/${encodeURIComponent(editingNote.id)}` : ""}`,
        {
          method: editingNote ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        note?: ApiCampaignNote;
      };
      if (!response.ok || !result.note)
        throw new Error(result.error ?? "Campaign note could not be saved.");

      const saved = normalizeNote(
        result.note,
        editingNote ?? undefined,
        notes.length,
      );
      onNotesChange((current) =>
        editingNote
          ? current.map((note) =>
              note.id === editingNote.id
                ? normalizeNote(result.note!, note, current.indexOf(note))
                : note,
            )
          : [saved, ...current],
      );
      setSelectedNote(saved);
      setEditorOpen(false);
      setEditingNote(null);
      onAction(
        editingNote
          ? `${result.note.title} updated.`
          : `${result.note.title} added to campaign memory.`,
      );
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Campaign note could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = async () => {
    if (
      !campaignId ||
      !editingNote ||
      !window.confirm(`Delete ${editingNote.title}?`)
    )
      return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/notes/${encodeURIComponent(editingNote.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Campaign note could not be deleted.");
      onNotesChange((current) =>
        current.filter((note) => note.id !== editingNote.id),
      );
      setSelectedNote(null);
      setEditingNote(null);
      setEditorOpen(false);
      onAction(`${editingNote.title} removed from campaign memory.`);
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Campaign note could not be deleted.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageLayout
      eyebrow="CAMPAIGN LOG // SHARED MEMORY"
      title="Campaign notes"
      description="Global context and episode notes, with authorship and visibility kept visible."
      action="ADD NOTE"
      onAction={() => openEditor()}
    >
      {editorOpen ? (
        <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
          <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
            <div>
              <p className={eyebrowClassName}>
                {isGM ? "GM / PLAYER NOTE" : "PLAYER NOTE"}
              </p>
              <h2 className="mt-[6px] text-[19px]">
                {editingNote
                  ? `Edit ${editingNote.title}`
                  : "Add a campaign note"}
              </h2>
            </div>
            <button
              className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
              aria-label="Close note editor"
              onClick={() => setEditorOpen(false)}
              title="Close note editor"
              type="button"
            >
              <X size={17} />
            </button>
          </div>
          <form
            className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
            onSubmit={saveNote}
          >
            <label>
              Title
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Note body
              <textarea
                maxLength={20000}
                placeholder="Record what the campaign should remember."
                value={draft.bodyMarkdown}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bodyMarkdown: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Episode
              <select
                className={editorSelectClassName}
                value={draft.episodeId ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    episodeId: event.target.value || null,
                  }))
                }
              >
                <option value="">Global campaign note</option>
                {episodes.map((episode) => (
                  <option key={episode.id} value={episode.id}>
                    {episode.title} ({episode.status})
                  </option>
                ))}
              </select>
            </label>
            {isGM ? (
              <label className="note-visibility-toggle">
                <input
                  type="checkbox"
                  checked={draft.visibility === "gm"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      visibility: event.target.checked ? "gm" : "player",
                    }))
                  }
                />
                <span>
                  <LockKeyhole size={13} /> GM ONLY
                </span>
              </label>
            ) : null}
            {error ? (
              <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
              <button
                className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff]"
                disabled={isSaving}
                type="submit"
              >
                <CirclePlus size={15} />{" "}
                {isSaving
                  ? "SAVING..."
                  : editingNote
                    ? "SAVE CHANGES"
                    : "ADD NOTE"}
              </button>
              {editingNote?.permissions.canDelete ? (
                <button
                  className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]"
                  disabled={isSaving}
                  onClick={deleteNote}
                  type="button"
                >
                  REMOVE
                </button>
              ) : null}
              <button
                className="text-action inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer hover:text-[#a1f3ff] max-[420px]:w-full max-[420px]:justify-start"
                disabled={isSaving}
                onClick={() => setEditorOpen(false)}
                type="button"
              >
                CANCEL
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <div className="notes-toolbar">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === "all" ? "filter-tab-active" : ""}`}
            onClick={() => setFilter("all")}
            type="button"
          >
            ALL NOTES <span>{notes.length.toString().padStart(2, "0")}</span>
          </button>
          <button
            className={`filter-tab ${filter === "global" ? "filter-tab-active" : ""}`}
            onClick={() => setFilter("global")}
            type="button"
          >
            GLOBAL
          </button>
          <button
            className={`filter-tab ${filter === "episodes" ? "filter-tab-active" : ""}`}
            onClick={() => setFilter("episodes")}
            type="button"
          >
            EPISODES
          </button>
        </div>
        {isGM ? (
          <button
            className={`visibility-toggle ${filter === "gm" ? "visibility-toggle-active" : ""}`}
            onClick={() => setFilter(filter === "gm" ? "all" : "gm")}
            type="button"
          >
            <LockKeyhole size={14} /> GM ONLY
          </button>
        ) : null}
      </div>
      {filteredNotes.length ? (
        <div className="notes-list">
          {filteredNotes.map((note) => (
            <article className="note-row" key={note.id}>
              <span className={`accent-mark accent-${note.accent}`} />
              <div className="note-main">
                <div className="note-meta">
                  <span>{note.episode_id ? "EPISODE" : "GLOBAL"}</span>
                  <span
                    className={`note-visibility ${note.visibility === "gm" ? "note-private" : ""}`}
                  >
                    {note.visibility === "gm" ? (
                      <LockKeyhole size={12} />
                    ) : (
                      <BookOpen size={12} />
                    )}{" "}
                    {note.visibility === "gm" ? "GM ONLY" : "PLAYER"}
                  </span>
                </div>
                <h3>{note.title}</h3>
                <p>
                  Added by <strong>{note.author.displayName}</strong>{" "}
                  <span className={metaDividerClassName} /> {noteAge(note)}
                </p>
              </div>
              <button
                className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
                aria-label={`Open note ${note.title}`}
                onClick={() =>
                  note.permissions.canEdit
                    ? openEditor(note)
                    : setSelectedNote(note)
                }
                title={
                  note.permissions.canEdit
                    ? `Edit ${note.title}`
                    : `Open ${note.title}`
                }
                type="button"
              >
                <ChevronRight size={17} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No notes in this view yet."
          message="Record the next piece of campaign memory when it becomes important."
        />
      )}
      {selectedNote && !editorOpen ? (
        <section className={recordDetailClassName}>
          <div>
            <p className={eyebrowClassName}>
              {selectedNote.visibility === "gm" ? "GM NOTE" : "PLAYER NOTE"}
            </p>
            <h2>{selectedNote.title}</h2>
            <p className={recordDetailMetaClassName}>
              Added by {selectedNote.author.displayName}
            </p>
          </div>
          <p>{selectedNote.body_markdown || "No note body recorded yet."}</p>
          {selectedNote.permissions.canEdit ? (
            <button
              className="text-action inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer hover:text-[#a1f3ff]"
              onClick={() => openEditor(selectedNote)}
              type="button"
            >
              EDIT NOTE <ChevronRight size={14} />
            </button>
          ) : null}
        </section>
      ) : null}
    </PageLayout>
  );
}

function PageLayout({
  eyebrow,
  title,
  description,
  action,
  onAction,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="page-intro flex items-end justify-between gap-6 mb-[29px] max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[19px] max-[760px]:mb-[25px]">
        <div>
          <p className={eyebrowBrightClassName}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className="m-0 max-w-[510px] text-[var(--muted)] text-[13px] leading-[1.6]">{description}</p>
        </div>
        {action ? (
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff]"
            onClick={onAction}
            type="button"
          >
            <CirclePlus size={16} /> {action}
          </button>
        ) : null}
      </div>
      {children}
    </>
  );
}
