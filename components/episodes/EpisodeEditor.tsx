"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Save, X } from "lucide-react";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { ApiEpisode, ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree } from "@/lib/places";

type EpisodeDraft = {
  title: string;
  summary: string;
  playerContextMarkdown: string;
  status: ApiEpisode["status"];
  startedAt: string;
  completedAt: string;
  placeId: string | null;
};

type EpisodeMutation = Omit<ApiEpisode, "noteCount">;

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toDraft(episode: ApiEpisode): EpisodeDraft {
  return {
    title: episode.title,
    summary: episode.summary,
    playerContextMarkdown: episode.player_context_markdown,
    status: episode.status,
    startedAt: toDateInput(episode.started_at),
    completedAt: toDateInput(episode.completed_at),
    placeId: episode.place_id,
  };
}

export default function EpisodeEditor({
  campaignId,
  episode,
  places,
  onCancel: parentOnCancel,
  onSaved,
}: {
  campaignId: string;
  episode: ApiEpisode;
  places: ApiPlace[];
  onCancel: () => void;
  onSaved: (episode: ApiEpisode) => void;
}) {
  const [draft, setDraftState] = useState<EpisodeDraft>(() => toDraft(episode));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setDirty, clearDirty } = useDirtyForm();
  const placeOptions = flattenPlaceTree(places).map(({ place, depth }) => ({
    value: place.id,
    label: `${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`,
  }));

  const update = <Field extends keyof EpisodeDraft>(field: Field, value: EpisodeDraft[Field]) => {
    setDirty();
    setDraftState((current) => ({ ...current, [field]: value }));
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
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/episodes/${encodeURIComponent(episode.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          summary: draft.summary,
          playerContextMarkdown: draft.playerContextMarkdown,
          status: draft.status,
          startedAt: draft.startedAt || null,
          completedAt: draft.completedAt || null,
          placeId: draft.placeId,
        }),
      });
      const result = (await response.json()) as { error?: string; episode?: EpisodeMutation };
      if (!response.ok || !result.episode) throw new Error(result.error ?? "Campaign episode could not be saved.");
      clearDirty();
      onSaved({ ...result.episode, noteCount: episode.noteCount });
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Campaign episode could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
          <p className={eyebrowClassName}>CAMPAIGN EPISODE EDITOR</p>
          <h2 className="mt-[6px] text-[19px]">Edit {episode.title}</h2>
        </div>
        <button
          aria-label="Close episode editor"
          className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
          disabled={isSaving}
          onClick={onCancel}
          title="Close episode editor"
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      <form
        className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
        onSubmit={save}
      >
        <div className="character-form-grid grid grid-cols-[1.6fr_1fr_1.2fr] gap-[10px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1">
          <label className="max-[760px]:[grid-column:1/-1] max-[420px]:[grid-column:auto]">
            Title
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
            />
          </label>
          <label>
            Status
            <select
              className={editorSelectClassName}
              value={draft.status}
              onChange={(event) => update("status", event.target.value as EpisodeDraft["status"])}
            >
              <option value="planned">PLANNED</option>
              <option value="active">ACTIVE</option>
              <option value="complete">COMPLETE</option>
              <option value="archived">ARCHIVED</option>
            </select>
          </label>
          <label>
            Primary place
            <select
              className={editorSelectClassName}
              value={draft.placeId ?? ""}
              onChange={(event) => update("placeId", event.target.value || null)}
            >
              <option value="">NO PRIMARY PLACE</option>
              {placeOptions.map((place) => (
                <option key={place.value} value={place.value}>
                  {place.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="character-form-grid grid grid-cols-2 gap-[10px] max-[420px]:grid-cols-1">
          <label>
            Start date
            <input
              type="date"
              value={draft.startedAt}
              onChange={(event) => update("startedAt", event.target.value)}
            />
          </label>
          <label>
            Completion date
            <input
              type="date"
              value={draft.completedAt}
              onChange={(event) => update("completedAt", event.target.value)}
            />
          </label>
        </div>
        <label>
          Summary
          <textarea
            maxLength={4000}
            value={draft.summary}
            onChange={(event) => update("summary", event.target.value)}
          />
        </label>
        <label>
          Player context
          <textarea
            maxLength={20000}
            value={draft.playerContextMarkdown}
            onChange={(event) => update("playerContextMarkdown", event.target.value)}
          />
        </label>
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
            <Save aria-hidden="true" size={15} /> {isSaving ? "SAVING..." : "SAVE EPISODE"}
          </button>
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
