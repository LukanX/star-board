"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";

export type AiDraftField = {
  key: string;
  label: string;
  maxLength: number;
  multiline?: boolean;
  readOnly?: boolean;
};

export type AiDraftSelectField = {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

type AiDraftAssistantProps = {
  campaignId: string | null;
  endpoint: string;
  entityLabel: string;
  mode: "create" | "refine";
  fields: AiDraftField[];
  contextFields?: AiDraftSelectField[];
  requestFields?: Record<string, string | null | undefined>;
  currentDraft?: Record<string, string>;
  onApply: (candidate: Record<string, string>) => void;
};

export default function AiDraftAssistant(props: AiDraftAssistantProps) {
  return <AiDraftAssistantContent key={`${props.campaignId ?? "none"}:${props.endpoint}`} {...props} />;
}

function AiDraftAssistantContent({ campaignId, endpoint, entityLabel, mode, fields, contextFields, requestFields, currentDraft, onApply }: AiDraftAssistantProps) {
  const [focus, setFocus] = useState("");
  const [candidate, setCandidate] = useState<Record<string, string> | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!campaignId) {
      setError("Select a campaign before using AI assistance.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mode,
          ...requestFields,
          model: selectedModel ?? undefined,
          focus: focus.trim() || undefined,
          currentDraft: currentDraft && Object.keys(currentDraft).length ? currentDraft : undefined,
        }),
      });
      const result = (await response.json()) as { error?: string; model?: string; draft?: Record<string, unknown> };

      if (!response.ok || !result.draft) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(retryAfter ? `${result.error ?? "AI assistance failed."} Retry in ${Math.ceil(Number(retryAfter) / 60)} minutes.` : result.error ?? "AI assistance failed.");
      }

      setLastModel(result.model ?? selectedModel);
      const nextCandidate: Record<string, string> = {};
      for (const field of fields) {
        const value = result.draft?.[field.key];
        nextCandidate[field.key] = typeof value === "string" ? value : "";
      }
      setCandidate(nextCandidate);
    } catch (generationError: unknown) {
      setError(generationError instanceof Error ? generationError.message : "AI assistance failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  return <section className="ai-draft-assistant"><div className="ai-draft-heading"><div><p className="eyebrow">GM TOOL // {entityLabel.toUpperCase()} DRAFT</p><h3>Build a starting point</h3></div><Sparkles size={17} /></div><p className="ai-draft-copy">Review every field before applying this candidate to the editor. Nothing is saved until the record form is submitted.</p>{contextFields?.length ? <div className="ai-draft-context"><p className="ai-draft-context-label">CAMPAIGN CONTEXT</p><div className="ai-draft-context-grid">{contextFields.map((field) => <label key={field.key}>{field.label}<select aria-label={field.label} value={field.value} onChange={(event) => field.onChange(event.target.value)}>{field.placeholder ? <option value="">{field.placeholder}</option> : null}{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div></div> : null}<AiModelPicker campaignId={campaignId} capability="structured-text" value={selectedModel} onChange={setSelectedModel} /><label>GM direction<textarea maxLength={600} placeholder={`What should this ${entityLabel.toLowerCase()} emphasize?`} value={focus} onChange={(event) => setFocus(event.target.value)} /></label>{candidate ? <div className="ai-draft-fields">{fields.map((field) => <label key={field.key}>{field.label}{field.multiline ? <textarea readOnly={field.readOnly} maxLength={field.maxLength} value={candidate[field.key] ?? ""} onChange={(event) => setCandidate((current) => current ? { ...current, [field.key]: event.target.value } : current)} /> : <input readOnly={field.readOnly} maxLength={field.maxLength} value={candidate[field.key] ?? ""} onChange={(event) => setCandidate((current) => current ? { ...current, [field.key]: event.target.value } : current)} />}</label>)}</div> : <div className="ai-draft-empty"><Sparkles size={17} /><span>NO CANDIDATE UNDER REVIEW</span></div>}{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="ai-draft-actions"><button className="button button-ai" disabled={isGenerating} onClick={() => void generate()} type="button">{isGenerating ? <><LoaderCircle className="spin" size={14} /> GENERATING...</> : <><Sparkles size={14} /> {candidate ? "REGENERATE CANDIDATE" : "GENERATE CANDIDATE"}</>}</button>{candidate ? <button className="button button-secondary" disabled={isGenerating} onClick={() => onApply(candidate)} type="button">APPLY TO EDITOR</button> : null}</div>{lastModel ? <p className="ai-draft-meta">{lastModel.toUpperCase()} / REVIEW DRAFT</p> : null}</section>;
}