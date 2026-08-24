"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AiArtStudio from "@/components/archive/AiArtStudio";
import { ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { eyebrowClassName } from "@/components/ui/terminalStyles";

type ArtKind = "character" | "npc" | "faction" | "job" | "place" | "enemy";

export type CampaignArtEditorTarget = {
  campaignId: string | null;
  kind: ArtKind;
  value: string | null;
  trackUnsavedUploads?: boolean;
  url?: string | null;
  subject?: string;
  currentPrompt?: string | null;
  onSubjectChange?: (subject: string) => void;
  onChange: (path: string | null) => void;
  onUrlChange: (url: string | null) => void;
  onPromptChange?: (prompt: string | null) => void;
  onProviderChange?: (provider: string | null) => void;
  onApproved?: (asset: {
    path: string;
    signedUrl: string;
    prompt: string;
    provider: string;
  }) => void;
};

const listeners = new Set<() => void>();
let currentTarget: CampaignArtEditorTarget | null = null;
const persistedArtKeys = new Set<string>();

function persistedArtKey(campaignId: string, path: string) {
  return `${campaignId}:${path}`;
}

export function markCampaignArtPersisted(
  campaignId: string,
  path: string | null | undefined,
) {
  if (path) persistedArtKeys.add(persistedArtKey(campaignId, path));
}

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
  return target ? <CampaignArtField key={target.kind} {...target} /> : null;
}

export default function CampaignArtField({
  campaignId,
  kind,
  value,
  trackUnsavedUploads = false,
  url,
  subject,
  currentPrompt,
  onSubjectChange,
  onChange,
  onUrlChange,
  onPromptChange,
  onProviderChange,
  onApproved,
}: CampaignArtEditorTarget) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadedPathsRef = useRef(new Set<string>());
  const persistedPathRef = useRef<string | null>(
    value && !value.startsWith("http") ? value : null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    url ?? (value?.startsWith("http") ? value : null),
  );
  const [artStudioOpen, setArtStudioOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackUnsavedUploads)
      persistedPathRef.current =
        value && !value.startsWith("http") ? value : null;
  }, [trackUnsavedUploads, value]);

  useEffect(
    () => () => {
      if (!campaignId) return;
      const pathsToRemove = [...uploadedPathsRef.current].filter((path) => {
        const key = persistedArtKey(campaignId, path);
        const wasPersisted =
          path === persistedPathRef.current || persistedArtKeys.has(key);
        if (persistedArtKeys.has(key)) persistedArtKeys.delete(key);
        return !wasPersisted;
      });
      for (const path of pathsToRemove) {
        void fetch(
          `/api/campaigns/${encodeURIComponent(campaignId ?? "")}/art?path=${encodeURIComponent(path)}`,
          { method: "DELETE" },
        );
      }
    },
    [campaignId],
  );

  useEffect(() => {
    if (url || value?.startsWith("http") || !campaignId || !value) return;

    let cancelled = false;
    void fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/art?path=${encodeURIComponent(value)}`,
    )
      .then(async (response) => {
        const result = (await response.json()) as {
          signedUrl?: string;
          error?: string;
        };
        if (!response.ok || !result.signedUrl)
          throw new Error(result.error ?? "Unable to load campaign art.");
        if (!cancelled) setPreviewUrl(result.signedUrl);
      })
      .catch(() => {
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
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/art`,
        { method: "POST", body: formData },
      );
      const result = (await response.json()) as {
        error?: string;
        asset?: { path: string; signedUrl: string };
      };

      if (!response.ok || !result.asset)
        throw new Error(result.error ?? "Unable to upload campaign art.");

      onChange(result.asset.path);
      onUrlChange(result.asset.signedUrl);
      onPromptChange?.(null);
      onProviderChange?.(null);
      uploadedPathsRef.current.add(result.asset.path);
      setPreviewUrl(result.asset.signedUrl);
    } catch (uploadError: unknown) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload campaign art.",
      );
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    onChange(null);
    onUrlChange(null);
    onPromptChange?.(null);
    onProviderChange?.(null);
    setPreviewUrl(null);
    setError(null);
  };

  return (
    <div className="grid gap-3 mb-4">
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-[14px] mb-0 p-3 border border-[rgba(98,232,255,.24)] bg-[rgba(98,232,255,.04)]">
        <div
          aria-label="Campaign art preview"
          className="w-[92px] h-[92px] grid place-items-center overflow-hidden border border-[var(--line)] bg-[rgba(8,11,17,.72)] bg-center bg-cover text-[var(--dim)]"
          role="img"
          style={
            previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined
          }
        >
          {previewUrl ? null : <ImagePlus size={22} />}
        </div>
        <div className="min-w-0 grid content-center gap-[5px]">
          <p className={eyebrowClassName}>CAMPAIGN ART</p>
          <strong className="text-[var(--ink)] font-mono text-[10px] tracking-[.08em]">
            {previewUrl ? "ART ASSET READY" : "NO ART ASSET"}
          </strong>
          <span className="text-[var(--dim)] text-[10px]">
            JPEG, PNG, WebP, or GIF - 5 MB maximum
          </span>
          <div
            data-campaign-art-actions
            className="flex items-center gap-2 mt-[5px]"
          >
            <input
              ref={inputRef}
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
              type="file"
            />
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] min-h-[30px] !px-[10px] !text-[8px]"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {isUploading ? (
                <>
                  <LoaderCircle className="animate-spin" size={14} /> UPLOADING...
                </>
              ) : (
                <>
                  <ImagePlus size={14} />{" "}
                  {previewUrl ? "REPLACE ART" : "UPLOAD ART"}
                </>
              )}
            </button>
            <button
              aria-expanded={artStudioOpen}
              className={`h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px min-h-[30px] !px-[10px] !text-[8px] ${artStudioOpen ? "bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]" : "!border-[rgba(255,92,154,.34)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]"}`}
              onClick={() => setArtStudioOpen((current) => !current)}
              type="button"
            >
              <Sparkles size={14} />{" "}
              {artStudioOpen ? "HIDE GENERATOR" : "GENERATE ART"}
            </button>
            {previewUrl ? (
              <button
                aria-label="Remove campaign art"
                className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
                disabled={isUploading}
                onClick={clear}
                title="Remove campaign art"
                type="button"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
          {error ? (
            <span
              className="m-0 mt-[2px] text-[var(--pink)] text-[10px]"
              role="alert"
            >
              {error}
            </span>
          ) : null}
        </div>
      </div>
      {campaignId && artStudioOpen ? (
        <div>
          <AiArtStudio
            campaignId={campaignId}
            kind={kind}
            subject={subject}
            currentPrompt={currentPrompt}
            onSubjectChange={onSubjectChange}
            onApproved={(asset) => {
              onChange(asset.path);
              onUrlChange(asset.signedUrl);
              onPromptChange?.(asset.prompt);
              onProviderChange?.(asset.provider);
              uploadedPathsRef.current.add(asset.path);
              onApproved?.(asset);
              setPreviewUrl(asset.signedUrl);
              setError(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
