"use client";

import { useEffect, useState } from "react";
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

export default function VisualStylePreview({ campaignId, style, visualStyleOverride, onSaved }: VisualStylePreviewProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (draft?.temporaryPath && !saved) void removeTemporaryArt(campaignId, draft.temporaryPath);
    };
  }, [campaignId, draft, saved]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    setSaved(false);

    try {
      if (draft?.temporaryPath) void removeTemporaryArt(campaignId, draft.temporaryPath);
      setDraft(null);
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mode: "create",
          purpose: "style-preview",
          targetKind: "visual-style",
          subject: previewSubject,
          visualStyleId: style?.id,
          visualStyleOverride: style ? undefined : visualStyleOverride?.trim(),
          model: selectedModel ?? undefined,
          aspectRatio: defaultImageAspectRatio,
          size: defaultImageSize,
        }),
      });
      const result = (await response.json()) as ImageResponse;
      if (response.status === 202 && result.job) {
        const nextDraft = await waitForImageBackgroundJob(result.job);
        setDraft(nextDraft);
      } else if (!response.ok || !result.draft) {
        throw new Error(result.error ?? "The style preview could not be generated.");
      } else {
        setDraft(result.draft);
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
      setSaved(true);
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(180px,.75fr)] gap-3 items-end max-[640px]:grid-cols-1">
        <div className="grid gap-[5px]">
          <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">OPTIONAL STYLE PREVIEW</span>
          <p className="m-0 text-[var(--muted)] text-[10px] leading-[1.45]">One neutral scene reveals how the style behaves across palette, light, texture, and composition.</p>
        </div>
        <AiModelPicker campaignId={campaignId} capability="image" value={selectedModel} onChange={setSelectedModel} />
      </div>
      {previewUrl ? <div className="w-full max-w-[360px] aspect-square border border-[rgba(255,92,154,.35)] bg-[#0a1118] bg-center bg-cover" role="img" aria-label="Visual style preview" style={{ backgroundImage: `url(${previewUrl})` }} /> : <div className="grid place-items-center w-full max-w-[360px] aspect-square border border-[rgba(139,151,169,.22)] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.035)_0_1px,transparent_1px_8px)] text-[var(--dim)]"><Sparkles size={16} /></div>}
      {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button className={secondaryButtonClassName} disabled={isGenerating || isSaving} type="button" onClick={() => void generate()}>
          {isGenerating ? <LoaderCircle className="animate-spin" size={13} /> : <RefreshCw size={13} />} {isGenerating ? "GENERATING..." : previewUrl ? "GENERATE NEW PREVIEW" : "GENERATE PREVIEW"}
        </button>
        {style && draft?.temporaryPath && !saved ? <button className={primaryButtonClassName} disabled={isGenerating || isSaving} type="button" onClick={() => void savePreview()}>{isSaving ? <LoaderCircle className="animate-spin" size={13} /> : <Save size={13} />} {isSaving ? "SAVING..." : "RETAIN THIS PREVIEW"}</button> : null}
      </div>
      <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">{saved ? "LATEST PREVIEW RETAINED WITH THIS STYLE." : style?.preview ? "SAVED PREVIEW // GENERATE A NEW ONE TO REPLACE IT." : style ? "UNSAVED PREVIEWS ARE CLEANED UP AUTOMATICALLY." : "SAVE THE STYLE FIRST TO RETAIN THIS PREVIEW."}</span>
    </div>
  );
}
