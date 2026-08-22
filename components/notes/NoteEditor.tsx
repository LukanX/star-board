"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CirclePlus, LockKeyhole, Trash2, X } from "lucide-react";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import type {
  ApiCampaignNote,
  CampaignNoteEpisode,
  NoteVisibility,
} from "@/lib/campaign/types";

type NoteDraft = {
  title: string;
  bodyMarkdown: string;
  visibility: NoteVisibility;
  episodeId: string | null;
};

const emptyDraft: NoteDraft = {
  title: "",
  bodyMarkdown: "",
  visibility: "player",
  episodeId: null,
};

function toDraft(note?: ApiCampaignNote): NoteDraft {
  return note
    ? {
        title: note.title,
        bodyMarkdown: note.body_markdown,
        visibility: note.visibility,
        episodeId: note.episode_id,
      }
    : { ...emptyDraft };
}

export default function NoteEditor({
  campaignId,
  role,
  episodes,
  note,
  onCancel: parentOnCancel,
  onSaved,
  onDeleted,
}: {
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
  const { setDirty, clearDirty } = useDirtyForm();

  const update = <Field extends keyof NoteDraft>(
    field: Field,
    value: NoteDraft[Field],
  ) => {
    setDirty();
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const onCancel = () => {
    clearDirty();
    parentOnCancel();
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
      const result = (await response.json()) as {
        error?: string;
        note?: ApiCampaignNote;
      };
      if (!response.ok || !result.note)
        throw new Error(result.error ?? "Campaign note could not be saved.");
      clearDirty();
      onSaved(result.note);
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

  const remove = async () => {
    if (
      !note ||
      !onDeleted ||
      isSaving ||
      !window.confirm(`Delete ${note.title}?`)
    )
      return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/notes/${encodeURIComponent(note.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Campaign note could not be deleted.");
      clearDirty();
      onDeleted(note.id);
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
    <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
          <p className="eyebrow">{isGM ? "GM / PLAYER NOTE" : "PLAYER NOTE"}</p>
          <h2 className="mt-[6px] text-[19px]">
            {note ? `Edit ${note.title}` : "Add a campaign note"}
          </h2>
        </div>
        <button
          aria-label="Close note editor"
          className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
          disabled={isSaving}
          onClick={onCancel}
          title="Close note editor"
          type="button"
        >
          <X size={17} />
        </button>
      </div>
      <form
        className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
        onSubmit={save}
      >
        <label>
          Title
          <input
            required
            maxLength={160}
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </label>
        <label>
          Note body
          <textarea
            maxLength={20000}
            placeholder="Record what the campaign should remember."
            value={draft.bodyMarkdown}
            onChange={(event) => update("bodyMarkdown", event.target.value)}
          />
        </label>
        <label>
          Episode
          <select
            className={editorSelectClassName}
            value={draft.episodeId ?? ""}
            onChange={(event) =>
              update("episodeId", event.target.value || null)
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
          <label
            data-note-visibility-toggle="true"
            className="!inline-flex items-center !gap-[8px] !text-[var(--pink)] cursor-pointer"
          >
            <input
              className="!w-[14px] !h-[14px] accent-[var(--pink)]"
              checked={draft.visibility === "gm"}
              onChange={(event) =>
                update("visibility", event.target.checked ? "gm" : "player")
              }
              type="checkbox"
            />
            <span className="inline-flex items-center gap-[5px]">
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
            {isSaving ? "SAVING..." : note ? "SAVE CHANGES" : "ADD NOTE"}
          </button>
          {note?.permissions.canDelete && onDeleted ? (
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]"
              disabled={isSaving}
              onClick={() => void remove()}
              type="button"
            >
              <Trash2 size={14} /> REMOVE
            </button>
          ) : null}
          <button
            className="text-action inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer hover:text-[#a1f3ff] max-[420px]:w-full max-[420px]:justify-start"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            CANCEL
          </button>
        </div>
      </form>
    </section>
  );
}
