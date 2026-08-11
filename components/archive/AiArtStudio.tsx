"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles, UploadCloud } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";

type ArtKind = "character" | "npc" | "faction" | "job";

type ImageDraft = {
  generationRunId: string;
  targetKind: ArtKind;
  mode: "create" | "refine";
  subject: string;
  prompt: string;
  provider: "openrouter";
  model: string;
  image: { base64: string | null; url: string | null; mediaType: "image/png" | "image/jpeg" | "image/webp" };
  createdAt: string;
};

type ImageAsset = {
  path: string;
  signedUrl: string;
  prompt: string;
  provider: string;
};

type AiArtStudioProps = {
  campaignId: string | null;
  kind: ArtKind;
  subject?: string;
  currentPrompt?: string | null;
  onSubjectChange?: (subject: string) => void;
  onApproved: (asset: ImageAsset) => void;
};

export default function AiArtStudio(props: AiArtStudioProps) {
  return <AiArtStudioContent key={`${props.campaignId ?? "none"}:${props.kind}`} {...props} />;
}

function AiArtStudioContent({ campaignId, kind, subject, currentPrompt, onSubjectChange, onApproved }: AiArtStudioProps) {
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [localSubjectDraft, setLocalSubjectDraft] = useState(subject ?? "");
  const [refinement, setRefinement] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectDraft = onSubjectChange ? subject ?? "" : localSubjectDraft;

  const generate = async (mode: "create" | "refine") => {
    if (!campaignId) {
      setError("Select a campaign before using the AI art studio.");
      return;
    }

    if (!subjectDraft.trim()) {
      setError("Add a subject before generating art.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mode,
          targetKind: kind,
          model: selectedModel ?? undefined,
          subject: subjectDraft,
          refinement: refinement.trim() || undefined,
          currentPrompt: draft?.prompt ?? currentPrompt ?? undefined,
        }),
      });
      const result = (await response.json()) as { error?: string; details?: string; issues?: { path?: (string | number)[]; message?: string }[]; draft?: ImageDraft };

      if (!response.ok || !result.draft) {
        const issueDetails = result.issues?.map((issue) => `${issue.path?.join(".") || "draft"}: ${issue.message ?? "invalid"}`).join("; ");
        throw new Error([result.error ?? "The art draft could not be generated.", result.details, issueDetails].filter(Boolean).join(" "));
      }

      setDraft(result.draft);
    } catch (generationError: unknown) {
      setError(generationError instanceof Error ? generationError.message : "The art draft could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  const approve = async () => {
    if (!campaignId || !draft) return;

    setIsApproving(true);
    setError(null);
    try {
      const file = await toImageFile(draft);
      const formData = new FormData();
      formData.append("kind", kind);
      formData.append("file", file);
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/art`, { method: "POST", body: formData });
      const result = (await response.json()) as { error?: string; asset?: { path: string; signedUrl: string } };

      if (!response.ok || !result.asset) {
        throw new Error(result.error ?? "The approved art could not be attached.");
      }

      onApproved({ ...result.asset, prompt: draft.prompt, provider: draft.provider });
    } catch (approvalError: unknown) {
      setError(approvalError instanceof Error ? approvalError.message : "The approved art could not be attached.");
    } finally {
      setIsApproving(false);
    }
  };

  const previewUrl = draft?.image.base64 ? `data:${draft.image.mediaType};base64,${draft.image.base64}` : draft?.image.url ?? null;

  return <section className="ai-art-studio"><div className="ai-art-studio-heading"><div><p className="eyebrow">GM TOOL // IMAGE DRAFT</p><h3>Shape the visual signal</h3></div><Sparkles size={17} /></div><AiModelPicker campaignId={campaignId} capability="image" value={selectedModel} onChange={setSelectedModel} />{previewUrl ? <div className="ai-art-preview" style={{ backgroundImage: `url(${previewUrl})` }} role="img" aria-label="Generated art draft" /> : <div className="ai-art-empty"><Sparkles size={18} /><span>NO REVIEW DRAFT</span></div>}<label>Visual subject<input maxLength={1200} placeholder="Describe the character, faction, mission, or scene..." value={subjectDraft} onChange={(event) => { const nextSubject = event.target.value; if (onSubjectChange) onSubjectChange(nextSubject); else setLocalSubjectDraft(nextSubject); }} /></label><label>Focused refinement<textarea maxLength={600} placeholder="Shift the lighting, silhouette, palette, or mood..." value={refinement} onChange={(event) => setRefinement(event.target.value)} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="ai-art-actions"><button className="button button-ai" disabled={isGenerating || isApproving} onClick={() => void generate(draft ? "refine" : "create")} type="button">{isGenerating ? <><LoaderCircle className="spin" size={14} /> GENERATING...</> : <><Sparkles size={14} /> {draft ? "REFINE DRAFT" : "GENERATE DRAFT"}</>}</button>{draft ? <button className="button button-secondary" disabled={isGenerating || isApproving} onClick={() => void approve()} type="button">{isApproving ? <><LoaderCircle className="spin" size={14} /> ATTACHING...</> : <><UploadCloud size={14} /> APPROVE & ATTACH</>}</button> : null}</div>{draft ? <p className="ai-art-meta">{draft.model.toUpperCase()} / {draft.image.mediaType} {" // "} {new Date(draft.createdAt).toLocaleTimeString()}</p> : null}</section>;
}

async function toImageFile(draft: ImageDraft) {
  if (draft.image.base64) {
    const bytes = Uint8Array.from(atob(draft.image.base64), (character) => character.charCodeAt(0));
    return new File([bytes], `generated-art.${extensionForMediaType(draft.image.mediaType)}`, { type: draft.image.mediaType });
  }

  if (!draft.image.url) {
    throw new Error("The art draft has no attachable image data.");
  }

  const response = await fetch(draft.image.url);
  if (!response.ok) throw new Error("The generated image could not be downloaded for approval.");
  const blob = await response.blob();
  const mediaType = blob.type || draft.image.mediaType;
  return new File([blob], `generated-art.${extensionForMediaType(mediaType)}`, { type: mediaType });
}

function extensionForMediaType(mediaType: string) {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}
