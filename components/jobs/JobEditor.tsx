"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CirclePlus, LockKeyhole, Sparkles, Trash2, X } from "lucide-react";
import AiDraftAssistant, {
  type AiDraftSelectField,
} from "@/components/archive/AiDraftAssistant";
import {
  markCampaignArtPersisted,
  useCampaignArtEditor,
} from "@/components/archive/CampaignArtField";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import type {
  ApiFaction,
  ApiJob,
  ApiNpc,
  ApiPlace,
  Mission,
} from "@/lib/campaign/types";
import { flattenPlaceTree } from "@/lib/places";

export type JobDraft = {
  title: string;
  summary: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  hook: string;
  giverType: "npc" | "faction";
  giverId: string;
  placeId: string | null;
  status: "draft" | "open" | "archived";
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyJobDraft: JobDraft = {
  title: "",
  summary: "",
  playerNotesMarkdown: "",
  gmNotesMarkdown: "",
  hook: "",
  giverType: "npc",
  giverId: "",
  placeId: null,
  status: "draft",
  artSubject: "",
  artPath: null,
  artUrl: null,
  artPrompt: null,
  artProvider: null,
};

function toDraft(job?: Mission): JobDraft {
  if (!job) return { ...emptyJobDraft };

  return {
    title: job.title,
    summary: job.summary,
    playerNotesMarkdown: job.playerNotesMarkdown,
    gmNotesMarkdown: job.gmNotesMarkdown ?? "",
    hook: job.hook ?? "",
    giverType: job.giverType.toLowerCase() as JobDraft["giverType"],
    giverId: job.giverId,
    placeId: job.placeId,
    status: job.status === "promoted" ? "open" : job.status,
    artSubject: job.artSubject ?? "",
    artPath: job.artPath ?? null,
    artUrl: job.artUrl ?? null,
    artPrompt: job.artPrompt ?? null,
    artProvider: job.artProvider ?? null,
  };
}

export default function JobEditor({
  campaignId,
  npcs,
  factions,
  places,
  job,
  onSaved,
  onDeleted,
  onCancel: parentOnCancel,
}: {
  campaignId: string;
  npcs: ApiNpc[];
  factions: ApiFaction[];
  places: ApiPlace[];
  job?: Mission;
  onSaved?: (job: ApiJob) => void;
  onDeleted?: (jobId: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraftState] = useState<JobDraft>(() => toDraft(job));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { setDirty, clearDirty } = useDirtyForm();
  const setDraft = (updater: (current: JobDraft) => JobDraft) => {
    setDirty();
    setDraftState(updater);
  };
  const giverOptions = (draft.giverType === "npc" ? npcs : factions).map(
    (giver) => ({ value: giver.id, label: giver.name }),
  );
  const placeOptions = flattenPlaceTree(places).map(({ place, depth }) => ({
    value: place.id,
    label: `${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`,
  }));

  const update = <Field extends keyof JobDraft>(
    field: Field,
    value: JobDraft[Field],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const onCancel = () => {
    clearDirty();
    parentOnCancel?.();
  };

  useCampaignArtEditor({
    campaignId,
    kind: "job",
    value: draft.artPath,
    trackUnsavedUploads: true,
    url: draft.artUrl,
    subject: draft.artSubject,
    currentPrompt: draft.artPrompt,
    onSubjectChange: (value) => update("artSubject", value),
    onChange: (value) => update("artPath", value),
    onUrlChange: (value) => update("artUrl", value),
    onPromptChange: (value) => update("artPrompt", value),
    onProviderChange: (value) => update("artProvider", value),
  });

  const contextFields: AiDraftSelectField[] = [
    {
      key: "giver-type",
      label: "GIVER TYPE",
      value: draft.giverType,
      options: [
        { value: "npc", label: "NPC" },
        { value: "faction", label: "FACTION" },
      ],
      onChange: (value) => {
        update("giverType", value as JobDraft["giverType"]);
        update("giverId", "");
      },
    },
    {
      key: "giver",
      label: draft.giverType === "npc" ? "NPC" : "FACTION",
      value: draft.giverId,
      placeholder: draft.giverType === "npc" ? "SELECT NPC" : "SELECT FACTION",
      options: giverOptions,
      onChange: (value) => update("giverId", value),
    },
    {
      key: "location",
      label: "LOCATION",
      value: draft.placeId ?? "",
      placeholder: "NO PRIMARY LOCATION",
      options: placeOptions,
      onChange: (value) => update("placeId", value || null),
    },
  ];

  const assistant = assistantOpen ? (
    <AiDraftAssistant
      campaignId={campaignId}
      endpoint="/api/ai/mission"
      entityLabel="job"
      mode={job ? "refine" : "create"}
      contextFields={contextFields}
      requestFields={{
        title: draft.title,
        ...(draft.giverId
          ? { giverType: draft.giverType, giverId: draft.giverId }
          : {}),
        ...(draft.placeId ? { placeId: draft.placeId } : {}),
      }}
      currentDraft={{
        title: draft.title,
        summary: draft.summary,
        playerNotes: draft.playerNotesMarkdown,
        gmNotes: draft.gmNotesMarkdown,
        hook: draft.hook,
        thumbnailDescription: draft.artSubject,
      }}
      fields={[
        { key: "title", label: "Title", maxLength: 160 },
        { key: "summary", label: "Summary", maxLength: 4000, multiline: true },
        {
          key: "playerNotes",
          label: "Player context",
          maxLength: 20000,
          multiline: true,
        },
        {
          key: "gmNotes",
          label: "GM notes",
          maxLength: 20000,
          multiline: true,
        },
        { key: "hook", label: "Hook", maxLength: 1200, multiline: true },
        {
          key: "thumbnailDescription",
          label: "Thumbnail description",
          maxLength: 1600,
          multiline: true,
        },
        {
          key: "suggestedGiverType",
          label: "Suggested giver type",
          maxLength: 20,
          readOnly: true,
        },
        {
          key: "suggestedGiverName",
          label: "Suggested giver",
          maxLength: 160,
          readOnly: true,
        },
      ]}
      onApply={(candidate) =>
        setDraft((current) => ({
          ...current,
          title: candidate.title ?? current.title,
          summary: candidate.summary ?? current.summary,
          playerNotesMarkdown:
            candidate.playerNotes ?? current.playerNotesMarkdown,
          gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown,
          hook: candidate.hook ?? current.hook,
          artSubject: candidate.thumbnailDescription ?? current.artSubject,
        }))
      }
    />
  ) : null;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/jobs`,
        {
          method: job ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job ? { ...draft, jobId: job.id } : draft),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        job?: ApiJob;
      };
      if (!response.ok || !result.job)
        throw new Error(result.error ?? "Job could not be saved.");

      markCampaignArtPersisted(campaignId, result.job.art_path);
      clearDirty();
      onSaved?.(result.job);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Job could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (
      !job ||
      isSaving ||
      !window.confirm(`Remove ${job.title} from the job board?`)
    )
      return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/jobs?jobId=${encodeURIComponent(job.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Job could not be removed.");
      clearDirty();
      onDeleted?.(job.id);
      onCancel?.();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Job could not be removed.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
          <p className="eyebrow">GM MISSION EDITOR</p>
          <h2 className="mt-[6px] text-[19px]">
            {job ? `Edit ${job.title}` : "New mission"}
          </h2>
        </div>
        <div className="editor-heading-actions flex items-center justify-end gap-2 flex-wrap max-[420px]:w-full max-[420px]:justify-start">
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] max-[420px]:flex-1"
            disabled={isSaving}
            onClick={() => setAssistantOpen((current) => !current)}
            type="button"
          >
            <Sparkles size={14} />{" "}
            {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE JOB"}
          </button>
          <button
            aria-label="Close mission editor"
            className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
            onClick={onCancel}
            title="Close mission editor"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
      </div>
      {assistant}
      {
        <form
          className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
          onSubmit={save}
        >
          <div className="character-form-grid grid grid-cols-[1.4fr_1fr_1.2fr_80px] gap-[10px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1">
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
                onChange={(event) =>
                  update("status", event.target.value as JobDraft["status"])
                }
              >
                <option value="draft">DRAFT</option>
                <option value="open">OPEN</option>
                <option value="archived">ARCHIVED</option>
              </select>
            </label>
            <label>
              Giver type
              <select
                className={editorSelectClassName}
                value={draft.giverType}
                onChange={(event) => {
                  update(
                    "giverType",
                    event.target.value as JobDraft["giverType"],
                  );
                  update("giverId", "");
                }}
              >
                <option value="npc">NPC</option>
                <option value="faction">FACTION</option>
              </select>
            </label>
            <label>
              Giver
              <select
                className={editorSelectClassName}
                required
                value={draft.giverId}
                onChange={(event) => update("giverId", event.target.value)}
              >
                <option value="">SELECT A GIVER</option>
                {giverOptions.map((giver) => (
                  <option key={giver.value} value={giver.value}>
                    {giver.label}
                  </option>
                ))}
              </select>
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
            Player notes
            <textarea
              maxLength={20000}
              value={draft.playerNotesMarkdown}
              onChange={(event) =>
                update("playerNotesMarkdown", event.target.value)
              }
            />
          </label>
          <label>
            Hook
            <textarea
              maxLength={1200}
              value={draft.hook}
              onChange={(event) => update("hook", event.target.value)}
            />
          </label>
          <label>
            GM notes{" "}
            <span className="inline-flex items-center gap-1 text-[var(--pink)]">
              <LockKeyhole size={11} /> PRIVATE
            </span>
            <textarea
              maxLength={20000}
              value={draft.gmNotesMarkdown}
              onChange={(event) =>
                update("gmNotesMarkdown", event.target.value)
              }
            />
          </label>
          <label className="place-quick-field">
            Primary place
            <select
              className={editorSelectClassName}
              value={draft.placeId ?? ""}
              onChange={(event) =>
                update("placeId", event.target.value || null)
              }
            >
              <option value="">NO PRIMARY PLACE</option>
              {placeOptions.map((place) => (
                <option key={place.value} value={place.value}>
                  {place.label}
                </option>
              ))}
            </select>
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
              <CirclePlus size={15} />{" "}
              {isSaving
                ? "SAVING..."
                : job
                  ? "SAVE CHANGES"
                  : "ADD TO JOB BOARD"}
            </button>
            {job ? (
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
      }
    </section>
  );
}
