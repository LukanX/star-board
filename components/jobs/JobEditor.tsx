"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CirclePlus, LockKeyhole, Sparkles, Trash2, X } from "lucide-react";
import AiDraftAssistant, { type AiDraftSelectField } from "@/components/archive/AiDraftAssistant";
import { markCampaignArtPersisted, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import type { ApiFaction, ApiJob, ApiNpc, ApiPlace, Mission } from "@/lib/campaign/types";
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

export default function JobEditor({ campaignId, npcs, factions, places, job, onSaved, onDeleted, onCancel }: {
  campaignId: string;
  npcs: ApiNpc[];
  factions: ApiFaction[];
  places: ApiPlace[];
  job?: Mission;
  onSaved?: (job: ApiJob) => void;
  onDeleted?: (jobId: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<JobDraft>(() => toDraft(job));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const giverOptions = (draft.giverType === "npc" ? npcs : factions).map((giver) => ({ value: giver.id, label: giver.name }));
  const placeOptions = flattenPlaceTree(places).map(({ place, depth }) => ({ value: place.id, label: `${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]` }));

  const update = <Field extends keyof JobDraft>(field: Field, value: JobDraft[Field]) => {
    setDraft((current) => ({ ...current, [field]: value }));
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
    { key: "giver-type", label: "GIVER TYPE", value: draft.giverType, options: [{ value: "npc", label: "NPC" }, { value: "faction", label: "FACTION" }], onChange: (value) => { update("giverType", value as JobDraft["giverType"]); update("giverId", ""); } },
    { key: "giver", label: draft.giverType === "npc" ? "NPC" : "FACTION", value: draft.giverId, placeholder: draft.giverType === "npc" ? "SELECT NPC" : "SELECT FACTION", options: giverOptions, onChange: (value) => update("giverId", value) },
    { key: "location", label: "LOCATION", value: draft.placeId ?? "", placeholder: "NO PRIMARY LOCATION", options: placeOptions, onChange: (value) => update("placeId", value || null) },
  ];

  const assistant = assistantOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/mission" entityLabel="job" mode={job ? "refine" : "create"} contextFields={contextFields} requestFields={{ title: draft.title, ...(draft.giverId ? { giverType: draft.giverType, giverId: draft.giverId } : {}), ...(draft.placeId ? { placeId: draft.placeId } : {}) }} currentDraft={{ title: draft.title, summary: draft.summary, playerNotes: draft.playerNotesMarkdown, gmNotes: draft.gmNotesMarkdown, hook: draft.hook, thumbnailDescription: draft.artSubject }} fields={[{ key: "title", label: "Title", maxLength: 160 }, { key: "summary", label: "Summary", maxLength: 4000, multiline: true }, { key: "playerNotes", label: "Player context", maxLength: 20000, multiline: true }, { key: "gmNotes", label: "GM notes", maxLength: 20000, multiline: true }, { key: "hook", label: "Hook", maxLength: 1200, multiline: true }, { key: "thumbnailDescription", label: "Thumbnail description", maxLength: 1600, multiline: true }, { key: "suggestedGiverType", label: "Suggested giver type", maxLength: 20, readOnly: true }, { key: "suggestedGiverName", label: "Suggested giver", maxLength: 160, readOnly: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, title: candidate.title ?? current.title, summary: candidate.summary ?? current.summary, playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown, gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown, hook: candidate.hook ?? current.hook, artSubject: candidate.thumbnailDescription ?? current.artSubject }))} /> : null;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs`, {
        method: job ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job ? { ...draft, jobId: job.id } : draft),
      });
      const result = (await response.json()) as { error?: string; job?: ApiJob };
      if (!response.ok || !result.job) throw new Error(result.error ?? "Job could not be saved.");

      markCampaignArtPersisted(campaignId, result.job.art_path);
      onSaved?.(result.job);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Job could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!job || isSaving || !window.confirm(`Remove ${job.title} from the job board?`)) return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs?jobId=${encodeURIComponent(job.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Job could not be removed.");
      onDeleted?.(job.id);
      onCancel?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Job could not be removed.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM MISSION EDITOR</p><h2>{job ? `Edit ${job.title}` : "New mission"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE JOB"}</button><button aria-label="Close mission editor" className="icon-button" onClick={onCancel} title="Close mission editor" type="button"><X size={17} /></button></div></div>{assistant}{<form className="character-form" onSubmit={save}><div className="character-form-grid"><label>Title<input required maxLength={160} value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label>Status<select value={draft.status} onChange={(event) => update("status", event.target.value as JobDraft["status"])}><option value="draft">DRAFT</option><option value="open">OPEN</option><option value="archived">ARCHIVED</option></select></label><label>Giver type<select value={draft.giverType} onChange={(event) => { update("giverType", event.target.value as JobDraft["giverType"]); update("giverId", ""); }}><option value="npc">NPC</option><option value="faction">FACTION</option></select></label><label>Giver<select required value={draft.giverId} onChange={(event) => update("giverId", event.target.value)}><option value="">SELECT A GIVER</option>{giverOptions.map((giver) => <option key={giver.value} value={giver.value}>{giver.label}</option>)}</select></label></div><label>Summary<textarea maxLength={4000} value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => update("playerNotesMarkdown", event.target.value)} /></label><label>Hook<textarea maxLength={1200} value={draft.hook} onChange={(event) => update("hook", event.target.value)} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => update("gmNotesMarkdown", event.target.value)} /></label><label className="place-quick-field">Primary place<select value={draft.placeId ?? ""} onChange={(event) => update("placeId", event.target.value || null)}><option value="">NO PRIMARY PLACE</option>{placeOptions.map((place) => <option key={place.value} value={place.value}>{place.label}</option>)}</select></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : job ? "SAVE CHANGES" : "ADD TO JOB BOARD"}</button>{job ? <button className="button button-danger" disabled={isSaving} onClick={() => void remove()} type="button"><Trash2 size={14} /> REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={onCancel} type="button">CANCEL</button></div></form>}</section>;
}