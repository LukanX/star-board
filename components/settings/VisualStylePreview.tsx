"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Save, Sparkles } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";
import { waitForImageBackgroundJob, type ImageBackgroundJob, type ImageDraft } from "@/lib/ai/image-job-polling";
import { defaultImageAspectRatio, defaultImageSize } from "@/lib/ai/image-options";

export type VisualStylePreviewRecord = {
  id: string;
  revision: number;
  preview: {
    signedUrl: string;
    createdAt: string | null;
  } | null;
};

type VisualStylePreviewProps = {
  campaignId: string;
  style?: VisualStylePreviewRecord;
  visualStyleOverride?: string;
  canRetain?: boolean;
  onDraftChange?: (draft: ImageDraft | null, markRetained: () => void) => void;
  onSaved?: () => void;
};

type ImageResponse = {
  error?: string;
  draft?: ImageDraft;
  job?: ImageBackgroundJob;
};

const previewSubject = "A lone courier skiff crossing a luminous dust storm above a frontier moon";
const secondaryButtonClassName = "h-[34px] inline-flex items-center justify-center gap-2 px-[11px] border border-[var(--line)] bg-[rgba(255,255,255,.035)] text-[var(--muted)] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName = "h-[34px] inline-flex items-center justify-center gap-2 px-[11px] border border-[var(--pink)] bg-[rgba(255,92,154,.1)] text-[var(--pink)] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:bg-[rgba(255,92,154,.18)] disabled:cursor-not-allowed disabled:opacity-50";

async function removeTemporaryArt(campaignId: string, path: string | undefined) {
  if (!path) return;
  await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/art?path=${encodeURIComponent(path)}`, { method: "DELETE" });
}

export default function VisualStylePreview({ campaignId, style, visualStyleOverride, canRetain = true, onDraftChange, onSaved }: VisualStylePreviewProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRetainedRef = useRef(false);

  const markDraftRetained = () => {
    draftRetainedRef.current = true;
    setSaved(true);
  };

  const updateDraft = (nextDraft: ImageDraft | null) => {
    draftRetainedRef.current = false;
    setSaved(false);
    setDraft(nextDraft);
    onDraftChange?.(nextDraft, markDraftRetained);
  };

  useEffect(() => {
    return () => {
      if (draft?.temporaryPath && !saved && !draftRetainedRef.current) void removeTemporaryArt(campaignId, draft.temporaryPath);
    };
  }, [campaignId, draft, saved]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    setSaved(false);

    try {
      if (draft?.temporaryPath) void removeTemporaryArt(campaignId, draft.temporaryPath);
      updateDraft(null);
      const styleOverride = visualStyleOverride?.trim();
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mode: "create",
          purpose: "style-preview",
          targetKind: "visual-style",
          subject: previewSubject,
          visualStyleId: styleOverride ? undefined : style?.id,
          visualStyleOverride: styleOverride || undefined,
          model: selectedModel ?? undefined,
          aspectRatio: defaultImageAspectRatio,
          size: defaultImageSize,
        }),
      });
      const result = (await response.json()) as ImageResponse;
      if (response.status === 202 && result.job) {
        const nextDraft = await waitForImageBackgroundJob(result.job);
        updateDraft(nextDraft);
      } else if (!response.ok || !result.draft) {
        throw new Error(result.error ?? "The style preview could not be generated.");
      } else {
        updateDraft(result.draft);
      }
    } catch (generationError: unknown) {
      setError(generationError instanceof Error ? generationError.message : "The style preview could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  const savePreview = async () => {
    if (!style || !draft?.temporaryPath) {
      setError("Generate a new preview before saving it.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles/${encodeURIComponent(style.id)}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationRunId: draft.generationRunId, prompt: draft.prompt, expectedRevision: style.revision }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The style preview could not be saved.");
      markDraftRetained();
      onSaved?.();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The style preview could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const localPreviewUrl = draft?.image.base64
    ? `data:${draft.image.mediaType};base64,${draft.image.base64}`
    : draft?.image.url ?? null;
  const previewUrl = localPreviewUrl ?? style?.preview?.signedUrl ?? null;

  return (
    <div className="grid gap-3 border-t border-[var(--line)] pt-3" data-visual-style-preview>
      <div className="grid gap-4 min-[760px]:grid-cols-[minmax(280px,1.1fr)_minmax(240px,1fr)] min-[760px]:items-start">
        <div>
          {previewUrl ? <div className="w-full max-w-[600px] aspect-square border border-[rgba(255,92,154,.35)] bg-[#0a1118] bg-center bg-cover" role="img" aria-label="Visual style preview" style={{ backgroundImage: `url(${previewUrl})` }} /> : <div className="grid place-items-center w-full max-w-[600px] aspect-square border border-[rgba(139,151,169,.22)] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.035)_0_1px,transparent_1px_8px)] text-[var(--dim)]"><Sparkles size={16} /></div>}
        </div>
        <div className="grid gap-3 min-w-0">
          <div className="grid gap-[5px]">
            <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">OPTIONAL STYLE PREVIEW</span>
            <p className="m-0 text-[var(--muted)] text-[10px] leading-[1.45]">One neutral scene reveals how the style behaves across palette, light, texture, and composition.</p>
          </div>
          <AiModelPicker campaignId={campaignId} capability="image" value={selectedModel} onChange={setSelectedModel} />
          {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClassName} disabled={isGenerating || isSaving} type="button" onClick={() => void generate()}>
              {isGenerating ? <LoaderCircle className="animate-spin" size={13} /> : <RefreshCw size={13} />} {isGenerating ? "GENERATING..." : previewUrl ? "GENERATE NEW PREVIEW" : "GENERATE PREVIEW"}
            </button>
            {style && draft?.temporaryPath && !saved && canRetain ? <button className={primaryButtonClassName} disabled={isGenerating || isSaving} type="button" onClick={() => void savePreview()}>{isSaving ? <LoaderCircle className="animate-spin" size={13} /> : <Save size={13} />} {isSaving ? "SAVING..." : "RETAIN THIS PREVIEW"}</button> : null}
          </div>
          <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">{saved ? "LATEST PREVIEW RETAINED WITH THIS STYLE." : draft && !canRetain ? "GENERATED PREVIEW // SAVE THE STYLE TO RETAIN IT." : style?.preview ? "SAVED PREVIEW // GENERATE A NEW ONE TO REPLACE IT." : style ? "UNSAVED PREVIEWS ARE CLEANED UP AUTOMATICALLY." : "SAVE THE STYLE FIRST TO RETAIN THIS PREVIEW."}</span>
        </div>
      </div>
    </div>
  );
}
