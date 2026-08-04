"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AiArtStudio from "@/components/archive/AiArtStudio";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

type ArtKind = "character" | "npc" | "faction" | "job";

export type CampaignArtEditorTarget = {
  campaignId: string | null;
  kind: ArtKind;
  value: string | null;
  url?: string | null;
  onChange: (path: string | null) => void;
  onUrlChange: (url: string | null) => void;
};

const listeners = new Set<() => void>();
let currentTarget: CampaignArtEditorTarget | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTarget() {
  return currentTarget;
}

function setTarget(target: CampaignArtEditorTarget | null) {
  currentTarget = target;
  listeners.forEach((listener) => listener());
}

export function useCampaignArtEditor(target: CampaignArtEditorTarget | null) {
  useEffect(() => {
    setTarget(target);
    return () => {
      if (currentTarget === target) setTarget(null);
    };
  }, [target]);
}

export function CampaignArtEditorSlot() {
  const target = useSyncExternalStore(subscribe, getTarget, () => null);
  return target ? <CampaignArtField key={`${target.kind}:${target.value ?? ""}:${target.url ?? ""}`} {...target} /> : null;
}

export default function CampaignArtField({ campaignId, kind, value, url, onChange, onUrlChange }: CampaignArtEditorTarget) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(url ?? (value?.startsWith("http") ? value : null));
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (url || value?.startsWith("http") || !campaignId || !value) return;

    let cancelled = false;
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/art?path=${encodeURIComponent(value)}`).then(async (response) => {
      const result = (await response.json()) as { signedUrl?: string; error?: string };
      if (!response.ok || !result.signedUrl) throw new Error(result.error ?? "Unable to load campaign art.");
      if (!cancelled) setPreviewUrl(result.signedUrl);
    }).catch(() => {
      if (!cancelled) setPreviewUrl(null);
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, url, value]);

  const upload = async (file: File) => {
    if (!campaignId) {
      setError("Select a campaign before uploading art.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("kind", kind);
      formData.append("file", file);
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/art`, { method: "POST", body: formData });
      const result = (await response.json()) as { error?: string; asset?: { path: string; signedUrl: string } };

      if (!response.ok || !result.asset) throw new Error(result.error ?? "Unable to upload campaign art.");

      onChange(result.asset.path);
      onUrlChange(result.asset.signedUrl);
      setPreviewUrl(result.asset.signedUrl);
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload campaign art.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    onChange(null);
    onUrlChange(null);
    setPreviewUrl(null);
    setError(null);
  };

  return <div className="campaign-art-stack"><div className="campaign-art-field"><div aria-label="Campaign art preview" className="campaign-art-preview" role="img" style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}>{previewUrl ? null : <ImagePlus size={22} />}</div><div className="campaign-art-copy"><p className="eyebrow">CAMPAIGN ART</p><strong>{previewUrl ? "ART ASSET READY" : "NO ART ASSET"}</strong><span>JPEG, PNG, WebP, or GIF - 5 MB maximum</span><div className="campaign-art-actions"><input ref={inputRef} accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} type="file" /><button className="button button-secondary" disabled={isUploading} onClick={() => inputRef.current?.click()} type="button">{isUploading ? <><LoaderCircle className="spin" size={14} /> UPLOADING...</> : <><ImagePlus size={14} /> {previewUrl ? "REPLACE ART" : "UPLOAD ART"}</>}</button>{previewUrl ? <button aria-label="Remove campaign art" className="icon-button" disabled={isUploading} onClick={clear} title="Remove campaign art" type="button"><X size={16} /></button> : null}</div>{error ? <span className="form-error" role="alert">{error}</span> : null}</div></div>{campaignId ? <AiArtStudio campaignId={campaignId} kind={kind} onApproved={(asset) => { onChange(asset.path); onUrlChange(asset.signedUrl); setPreviewUrl(asset.signedUrl); setError(null); }} /> : null}</div>;
}
