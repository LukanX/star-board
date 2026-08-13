"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles, UploadCloud, X } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";
import { defaultImageAspectRatio, defaultImageSize, imageAspectRatioValues, imageSizeOptions, type ImageAspectRatio, type ImageSize } from "@/lib/ai/image-options";

type ArtKind = "character" | "npc" | "faction" | "job" | "place";

type ImageDraft = {
  generationRunId: string;
  targetKind: ArtKind;
  mode: "create" | "refine";
  subject: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
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

type ImageValidationIssue = { path?: (string | number)[]; message?: string };
type ImageValidationIssues = ImageValidationIssue[] | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };

function formatImageValidationIssues(issues: ImageValidationIssues | undefined) {
  if (!issues) return undefined;
  if (Array.isArray(issues)) {
    return issues.map((issue) => `${issue.path?.join(".") || "draft"}: ${issue.message ?? "invalid"}`).join("; ");
  }

  return [
    ...(issues.formErrors ?? []),
    ...Object.entries(issues.fieldErrors ?? {}).flatMap(([path, messages]) => messages.map((message) => `${path}: ${message}`)),
  ].join("; ") || undefined;
}

export default function AiArtStudio(props: AiArtStudioProps) {
  return <AiArtStudioContent key={`${props.campaignId ?? "none"}:${props.kind}`} {...props} />;
}

function AiArtStudioContent({ campaignId, kind, subject, currentPrompt, onSubjectChange, onApproved }: AiArtStudioProps) {
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(defaultImageAspectRatio);
  const [size, setSize] = useState<ImageSize>(defaultImageSize);
  const [localSubjectDraft, setLocalSubjectDraft] = useState(subject ?? "");
  const [refinement, setRefinement] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectDraft = onSubjectChange ? subject ?? "" : localSubjectDraft;
  const availableSizes = imageSizeOptions[aspectRatio];

  useEffect(() => {
    if (!isPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewOpen]);

  const changeAspectRatio = (nextAspectRatio: ImageAspectRatio) => {
    const currentTier = imageSizeOptions[aspectRatio].find((option) => option.value === size)?.tier ?? "1K";
    setAspectRatio(nextAspectRatio);
    setSize(imageSizeOptions[nextAspectRatio].find((option) => option.tier === currentTier)?.value ?? imageSizeOptions[nextAspectRatio][0].value);
  };

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
          aspectRatio,
          size,
          refinement: refinement.trim() || undefined,
          currentPrompt: draft?.prompt ?? currentPrompt ?? undefined,
        }),
      });
      const result = (await response.json()) as { error?: string; details?: string; issues?: ImageValidationIssues; draft?: ImageDraft };

      if (!response.ok || !result.draft) {
        const issueDetails = formatImageValidationIssues(result.issues);
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
  const previewAspectRatio = draft?.aspectRatio.replace(":", " / ") ?? "1 / 1";

  return <section className="ai-art-studio"><div className="ai-art-studio-heading"><div><p className="eyebrow">GM TOOL // IMAGE DRAFT</p><h3>Shape the visual signal</h3></div><Sparkles size={17} /></div><div className="ai-art-size-controls"><fieldset className="ai-art-ratio-control"><legend>ASPECT RATIO</legend><div className="ai-art-ratio-grid" aria-label="Image aspect ratio" role="group">{imageAspectRatioValues.map((option) => <button aria-pressed={aspectRatio === option} className={`ai-art-ratio-option${aspectRatio === option ? " is-selected" : ""}`} key={option} onClick={() => changeAspectRatio(option)} type="button"><span className="ai-art-ratio-shape" style={{ aspectRatio: option.replace(":", " / ") }} aria-hidden="true" /><span>{option}</span></button>)}</div></fieldset><div className="ai-art-generation-controls"><AiModelPicker campaignId={campaignId} capability="image" value={selectedModel} onChange={setSelectedModel} /><label>OUTPUT SIZE<select aria-label="Image output size" value={size} onChange={(event) => setSize(event.target.value as ImageSize)}>{availableSizes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div></div>{previewUrl ? <button className="ai-art-preview-button" type="button" onClick={() => setIsPreviewOpen(true)} aria-label="Open generated art preview"><div className="ai-art-preview" style={{ backgroundImage: `url(${previewUrl})`, aspectRatio: previewAspectRatio }} role="img" aria-label="Generated art draft" /></button> : <div className="ai-art-empty"><Sparkles size={18} /><span>NO REVIEW DRAFT</span></div>}{isPreviewOpen && previewUrl ? <div className="ai-art-lightbox" role="dialog" aria-modal="true" aria-label="Generated art preview" onClick={() => setIsPreviewOpen(false)}><div className="ai-art-lightbox-content" onClick={(event) => event.stopPropagation()}><button className="ai-art-lightbox-close icon-button" type="button" onClick={() => setIsPreviewOpen(false)} aria-label="Close generated art preview"><X size={18} /></button><img className="ai-art-lightbox-image" src={previewUrl} alt="Generated art draft enlarged" /></div></div> : null}<label>Visual subject<input maxLength={1200} placeholder="Describe the character, faction, mission, or scene..." value={subjectDraft} onChange={(event) => { const nextSubject = event.target.value; if (onSubjectChange) onSubjectChange(nextSubject); else setLocalSubjectDraft(nextSubject); }} /></label><label>Focused refinement<textarea maxLength={600} placeholder="Shift the lighting, silhouette, palette, or mood..." value={refinement} onChange={(event) => setRefinement(event.target.value)} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="ai-art-actions"><button className="button button-ai" disabled={isGenerating || isApproving} onClick={() => void generate(draft ? "refine" : "create")} type="button">{isGenerating ? <><LoaderCircle className="spin" size={14} /> GENERATING...</> : <><Sparkles size={14} /> {draft ? "REFINE DRAFT" : "GENERATE DRAFT"}</>}</button>{draft ? <button className="button button-secondary" disabled={isGenerating || isApproving} onClick={() => void approve()} type="button">{isApproving ? <><LoaderCircle className="spin" size={14} /> ATTACHING...</> : <><UploadCloud size={14} /> APPROVE & ATTACH</>}</button> : null}</div>{draft ? <p className="ai-art-meta">{draft.model.toUpperCase()} / {draft.aspectRatio} / {draft.size} / {draft.image.mediaType} {" // "} {new Date(draft.createdAt).toLocaleTimeString()}</p> : null}</section>;
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
