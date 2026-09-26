"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles, UploadCloud, X } from "lucide-react";
import AiModelPicker, { type AiModelOptions } from "@/components/archive/AiModelPicker";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { waitForImageBackgroundJob, type ImageBackgroundJob, type ImageDraft } from "@/lib/ai/image-job-polling";
import { imageGenerationRequestTimeoutMs } from "@/lib/ai/image-job-lifecycle";
import {
  artStudioSessionEvent,
  artStudioSessionKey,
  draftMetadataForSession,
  emptyArtStudioSession,
  readArtStudioSession,
  writeArtStudioSession,
  type ArtStudioDraftMetadata,
} from "@/components/archive/artStudioSession";
import {
  defaultImageAspectRatio,
  getSupportedImageAspectRatios,
  type ImageAspectRatio,
} from "@/lib/ai/image-options";

type ArtKind = "character" | "npc" | "faction" | "job" | "place" | "enemy";

type ImageAsset = {
  path: string;
  signedUrl: string;
  prompt: string;
  provider: string;
};

type ArtStyleOption = {
  id: string;
  name: string;
  status: "draft" | "ready";
};

type AiArtStudioProps = {
  campaignId: string | null;
  kind: ArtKind;
  entityId?: string;
  characterId?: string;
  portraitAiRole?: "gm" | "player";
  parentPlaceId?: string | null;
  subject?: string;
  currentPrompt?: string | null;
  onSubjectChange?: (subject: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onApproved: (asset: ImageAsset) => void;
};

type ImageValidationIssue = { path?: (string | number)[]; message?: string };
type ImageValidationIssues =
  | ImageValidationIssue[]
  | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };

type GalleryDraft = { draft: ImageDraft; styleId: string | null; contextPlaceId: string | null };

function formatImageValidationIssues(
  issues: ImageValidationIssues | undefined,
) {
  if (!issues) return undefined;
  if (Array.isArray(issues)) {
    return issues
      .map(
        (issue) =>
          `${issue.path?.join(".") || "draft"}: ${issue.message ?? "invalid"}`,
      )
      .join("; ");
  }

  return (
    [
      ...(issues.formErrors ?? []),
      ...Object.entries(issues.fieldErrors ?? {}).flatMap(([path, messages]) =>
        messages.map((message) => `${path}: ${message}`),
      ),
    ].join("; ") || undefined
  );
}

async function restoreDraft(metadata: ArtStudioDraftMetadata): Promise<GalleryDraft | null> {
  const response = await fetch(`/api/ai/image/${encodeURIComponent(metadata.generationRunId)}`, {
    cache: "no-store",
  });
  const result = (await response.json().catch(() => ({}))) as {
    job?: {
      status?: string;
      model?: string;
      createdAt?: string;
      temporaryPath?: string;
      image?: ImageDraft["image"];
    };
  };
  if (!response.ok || result.job?.status !== "complete" || !result.job.image) return null;
  const { styleId, ...storedDraft } = metadata;
  const { contextPlaceId, ...draftMetadata } = storedDraft;
  return {
    styleId,
    contextPlaceId,
    draft: {
      ...draftMetadata,
      model: result.job.model ?? metadata.model,
      createdAt: result.job.createdAt ?? metadata.createdAt,
      temporaryPath: result.job.temporaryPath ?? metadata.temporaryPath,
      image: result.job.image,
    },
  };
}

async function restoreArtStudioSession(identity: Parameters<typeof readArtStudioSession>[0]) {
  const session = readArtStudioSession(identity);
  const restored = await Promise.all(session.drafts.map((metadata) => restoreDraft(metadata).catch(() => null)));
  const gallery = restored.filter((entry): entry is GalleryDraft => entry !== null);
  const selectedDraft = gallery.find((entry) => entry.draft.generationRunId === session.selectedGenerationRunId)
    ?? gallery.at(-1)
    ?? null;
  return { session, gallery, selectedDraft };
}

export default function AiArtStudio(props: AiArtStudioProps) {
  return (
    <AiArtStudioContent
      key={`${props.campaignId ?? "none"}:${props.kind}:${props.entityId ?? props.characterId ?? "new"}:${props.portraitAiRole ?? "default"}`}
      {...props}
    />
  );
}

function AiArtStudioContent({
  campaignId,
  kind,
  entityId,
  characterId,
  portraitAiRole,
  parentPlaceId,
  subject,
  currentPrompt,
  onSubjectChange,
  onBusyChange,
  onApproved,
}: AiArtStudioProps) {
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [gallery, setGallery] = useState<GalleryDraft[]>([]);
  const [isSessionReady, setIsSessionReady] = useState(!campaignId);
  const [styles, setStyles] = useState<ArtStyleOption[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [styleSelectionChanged, setStyleSelectionChanged] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedModelOptions, setSelectedModelOptions] = useState<AiModelOptions | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<ImageAspectRatio>(
    defaultImageAspectRatio,
  );
  const [localSubjectDraft, setLocalSubjectDraft] = useState(subject ?? "");
  const [refinement, setRefinement] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeGenerationRef = useRef<AbortController | null>(null);
  const refreshingRunIdsRef = useRef(new Set<string>());
  const sessionDisabledRef = useRef(false);

  const subjectDraft = onSubjectChange ? (subject ?? "") : localSubjectDraft;
  const availableAspectRatios = getSupportedImageAspectRatios(selectedModelOptions?.supportedParameters, selectedModelOptions?.parameterValues);
  const aspectRatio = availableAspectRatios.find((ratio) => ratio === selectedAspectRatio)
    ?? availableAspectRatios[0]
    ?? selectedAspectRatio;
  const isCharacterPortrait = kind === "character" && Boolean(characterId);
  const canCustomizePortrait = !isCharacterPortrait || portraitAiRole === "gm";
  const sessionKey = campaignId
    ? artStudioSessionKey({ campaignId, kind, entityId: entityId ?? characterId ?? null })
    : null;
  const selectedEntry = gallery.find((entry) => entry.draft.generationRunId === draft?.generationRunId) ?? null;
  const generationContextPlaceId = kind === "place" ? parentPlaceId ?? null : null;
  const canRefineSelectedDraft = Boolean(
    selectedEntry
    && selectedEntry.styleId === selectedStyleId
    && selectedEntry.contextPlaceId === generationContextPlaceId,
  );

  useEffect(() => {
    if (!campaignId || (isCharacterPortrait && portraitAiRole !== "gm")) return;

    let cancelled = false;
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { styles?: ArtStyleOption[] };
        if (!response.ok || !result.styles || cancelled) return;
        setStyles(result.styles.filter((style) => style.status === "ready"));
      })
      .catch(() => {
        if (!cancelled) setStyles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, isCharacterPortrait, portraitAiRole]);

  useEffect(() => {
    return () => activeGenerationRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!campaignId) return;

    let cancelled = false;
    sessionDisabledRef.current = false;
    const identity = { campaignId, kind, entityId: entityId ?? characterId ?? null };
    void restoreArtStudioSession(identity)
      .then(({ session, gallery: restoredGallery, selectedDraft }) => {
        if (cancelled) return;
        setRefinement(session.refinement);
        setSelectedStyleId(session.selectedStyleId);
        setStyleSelectionChanged(session.styleSelectionChanged);
        setGallery(restoredGallery);
        setDraft(selectedDraft?.draft ?? null);
        setIsSessionReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, kind, entityId, characterId]);

  useEffect(() => {
    if (!campaignId || !isSessionReady || sessionDisabledRef.current) return;
    writeArtStudioSession(
      { campaignId, kind, entityId: entityId ?? characterId ?? null },
      {
        version: 1,
        refinement,
        selectedStyleId,
        styleSelectionChanged,
        selectedGenerationRunId: draft?.generationRunId ?? null,
        drafts: gallery.map((entry) => draftMetadataForSession(entry.draft, entry.styleId, entry.contextPlaceId)),
      },
    );
  }, [campaignId, kind, entityId, characterId, isSessionReady, refinement, selectedStyleId, styleSelectionChanged, draft, gallery]);

  useEffect(() => {
    const handleSessionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string | null }>).detail;
      if (detail?.key !== null && detail?.key !== sessionKey) return;
      if (detail?.key === null) {
        sessionDisabledRef.current = true;
        const empty = emptyArtStudioSession();
        setRefinement(empty.refinement);
        setSelectedStyleId(empty.selectedStyleId);
        setStyleSelectionChanged(empty.styleSelectionChanged);
        setDraft(null);
        setGallery([]);
        return;
      }
      if (!campaignId) return;
      const updated = readArtStudioSession({ campaignId, kind, entityId: entityId ?? characterId ?? null });
      setRefinement(updated.refinement);
      setSelectedStyleId(updated.selectedStyleId);
      setStyleSelectionChanged(updated.styleSelectionChanged);
      setDraft(null);
      setGallery([]);
    };

    window.addEventListener(artStudioSessionEvent, handleSessionChange);
    return () => window.removeEventListener(artStudioSessionEvent, handleSessionChange);
  }, [sessionKey, campaignId, kind, entityId, characterId]);

  useEffect(() => {
    onBusyChange?.(isGenerating || isApproving);
    return () => {
      if (isGenerating || isApproving) onBusyChange?.(false);
    };
  }, [isApproving, isGenerating, onBusyChange]);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewOpen]);

  const changeAspectRatio = (nextAspectRatio: ImageAspectRatio) => {
    setSelectedAspectRatio(nextAspectRatio);
  };

  const generate = async () => {
    if (!campaignId) {
      setError("Select a campaign before using the AI art studio.");
      return;
    }

    if (!isSessionReady) return;

    const requestedStyleId = selectedStyleId;
    const requestedContextPlaceId = generationContextPlaceId;
    const requestedMode = canRefineSelectedDraft ? "refine" : "create";
    const requestedPrompt = selectedEntry
      ? (canRefineSelectedDraft ? selectedEntry.draft.prompt : undefined)
      : (styleSelectionChanged ? undefined : currentPrompt ?? undefined);

    if (subjectDraft.length > 1200) {
      setError("Visual direction must be 1200 characters or fewer.");
      return;
    }

    if (!subjectDraft.trim()) {
      setError("Add a subject before generating art.");
      return;
    }

    if (outcomeUnknown && !window.confirm("The previous image request may have been billed without returning a draft. Check OpenRouter usage before generating again. Start another potentially charged request?")) return;

    setIsGenerating(true);
    setError(null);
    activeGenerationRef.current?.abort();
    const generationController = new AbortController();
    let generationRequestTimedOut = false;
    const generationRequestTimeoutId = window.setTimeout(() => {
      generationRequestTimedOut = true;
      generationController.abort();
    }, imageGenerationRequestTimeoutMs);
    activeGenerationRef.current = generationController;
    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: generationController.signal,
        body: JSON.stringify({
          campaignId,
          mode: requestedMode,
          targetKind: kind,
          characterId: characterId ?? undefined,
          visualStyleId: canCustomizePortrait ? selectedStyleId ?? undefined : undefined,
          parentPlaceId: parentPlaceId ?? undefined,
          model: canCustomizePortrait ? selectedModel ?? undefined : undefined,
          subject: subjectDraft,
          aspectRatio,
          refinement: refinement.trim() || undefined,
          currentPrompt: requestedPrompt,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        details?: string;
        diagnosticStage?: string;
        outcomeUnknown?: boolean;
        providerRequestId?: string;
        issues?: ImageValidationIssues;
        draft?: ImageDraft;
        job?: ImageBackgroundJob;
      };
      window.clearTimeout(generationRequestTimeoutId);

      if (response.status === 202 && result.job) {
        const nextDraft = await waitForImageBackgroundJob(result.job, { signal: generationController.signal });
        setOutcomeUnknown(false);
        setGallery((current) => [
          ...current.filter((entry) => entry.draft.generationRunId !== nextDraft.generationRunId),
          { draft: nextDraft, styleId: requestedStyleId, contextPlaceId: requestedContextPlaceId },
        ]);
        setDraft(nextDraft);
        return;
      }

      if (!response.ok || !result.draft) {
        if (result.outcomeUnknown) setOutcomeUnknown(true);
        const issueDetails = formatImageValidationIssues(result.issues);
        const providerDetails = result.providerRequestId
          ? `HTTP ${response.status}. OpenRouter request ID: ${result.providerRequestId.slice(0, 160)}.`
          : !response.ok
            ? `HTTP ${response.status}.`
            : undefined;
        const diagnosticDetails = result.diagnosticStage
          ? `Failure stage: ${result.diagnosticStage}.`
          : undefined;
        const socketCaution = result.outcomeUnknown
          ? "The connection closed before a response; check OpenRouter usage before retrying, as the request may have completed."
          : undefined;
        throw new Error(
          [
            result.error ?? "The art draft could not be generated.",
            result.details,
            issueDetails,
            providerDetails,
            diagnosticDetails,
            socketCaution,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }

      setGallery((current) => [
        ...current.filter((entry) => entry.draft.generationRunId !== result.draft!.generationRunId),
        { draft: result.draft!, styleId: requestedStyleId, contextPlaceId: requestedContextPlaceId },
      ]);
      setOutcomeUnknown(false);
      setDraft(result.draft);
    } catch (generationError: unknown) {
      if (generationController.signal.aborted && !generationRequestTimedOut) return;
      if (generationError instanceof Error && generationError.name === "ImageJobOutcomeUnknownError") setOutcomeUnknown(true);
      setError(
        generationRequestTimedOut
          ? "The image generation request timed out. Check the art service and try again."
          : generationError instanceof Error
          ? generationError.message
          : "The art draft could not be generated.",
      );
    } finally {
      if (activeGenerationRef.current === generationController) {
        activeGenerationRef.current = null;
        if (!generationController.signal.aborted || generationRequestTimedOut) setIsGenerating(false);
      }
      window.clearTimeout(generationRequestTimeoutId);
    }
  };

  const refreshDraftImage = async (generationRunId: string) => {
    if (refreshingRunIdsRef.current.has(generationRunId)) return;
    refreshingRunIdsRef.current.add(generationRunId);
    try {
      const response = await fetch(`/api/ai/image/${encodeURIComponent(generationRunId)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as {
        job?: {
          status?: string;
          image?: ImageDraft["image"];
          model?: string;
          createdAt?: string;
          temporaryPath?: string;
        };
      };
      if (!response.ok || result.job?.status !== "complete" || !result.job.image) return;
      const updatedDraft = (current: ImageDraft): ImageDraft => ({
        ...current,
        image: result.job!.image!,
        model: result.job!.model ?? current.model,
        createdAt: result.job!.createdAt ?? current.createdAt,
        temporaryPath: result.job!.temporaryPath ?? current.temporaryPath,
      });
      setGallery((current) => current.map((entry) => entry.draft.generationRunId === generationRunId
        ? { ...entry, draft: updatedDraft(entry.draft) }
        : entry));
      setDraft((current) => current?.generationRunId === generationRunId ? updatedDraft(current) : current);
    } finally {
      refreshingRunIdsRef.current.delete(generationRunId);
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
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/art`,
        { method: "POST", body: formData },
      );
      const result = (await response.json()) as {
        error?: string;
        asset?: { path: string; signedUrl: string };
      };

      if (!response.ok || !result.asset) {
        throw new Error(
          result.error ?? "The approved art could not be attached.",
        );
      }

      onApproved({
        ...result.asset,
        prompt: draft.prompt,
        provider: draft.provider,
      });
    } catch (approvalError: unknown) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "The approved art could not be attached.",
      );
    } finally {
      setIsApproving(false);
    }
  };

  const previewUrl = draft?.image.base64
    ? `data:${draft.image.mediaType};base64,${draft.image.base64}`
    : (draft?.image.url ?? null);
  const previewAspectRatio = draft?.aspectRatio.replace(":", " / ") ?? "1 / 1";
  const selectedStyleName = styles.find((style) => style.id === selectedStyleId)?.name;

  return (
    <section className="grid gap-[10px] p-[13px] border border-[rgba(255,92,154,.3)] bg-[linear-gradient(120deg,rgba(255,92,154,.07),rgba(185,146,255,.035))]">
      <div className="flex items-start justify-between gap-3 text-[var(--pink)]">
        <div>
          <p className={`${eyebrowClassName} !mb-[5px] text-[var(--pink)]`}>{isCharacterPortrait ? `${portraitAiRole === "player" ? "PLAYER ART" : "GM ART"} // PORTRAIT DRAFT` : "ARTWORK DRAFT"}</p>
          <h3 className="m-0 text-[14px]">{isCharacterPortrait ? "Edit the saved character portrait" : "Create or refine campaign artwork"}</h3>
        </div>
        <Sparkles size={17} />
      </div>
      <div className="grid gap-[10px]">
        {canCustomizePortrait ? <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
          VISUAL STYLE
          <select
            className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none px-[10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--pink)] focus:shadow-[0_0_0_2px_rgba(255,92,154,.1)]"
            aria-label="Visual style for image generation"
            value={selectedStyleId ?? ""}
            onChange={(event) => {
              const nextStyleId = event.target.value || null;
              if (nextStyleId === selectedStyleId) return;
              setSelectedStyleId(nextStyleId);
              setStyleSelectionChanged(true);
              setError(null);
            }}
          >
            <option value="">CAMPAIGN DEFAULT</option>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
          <span className="text-[var(--dim)] text-[8px] tracking-[.04em]">{selectedStyleName ? `SELECTED // ${selectedStyleName}` : "SELECT A READY STYLE OR USE THE CAMPAIGN DEFAULT."}</span>
        </label> : null}
        {availableAspectRatios.length ? (
          <fieldset className="grid gap-2 min-w-0 m-0 p-0 border-0">
            <legend className="p-0 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">ASPECT RATIO</legend>
            <div
              className={`grid gap-2 w-full min-w-0 max-[760px]:grid-cols-2 ${availableAspectRatios.length === 1 ? "max-w-[120px] grid-cols-1" : "max-w-[480px] grid-cols-4"}`}
              aria-label="Image aspect ratio"
              role="group"
            >
              {availableAspectRatios.map((option) => (
                <button
                  aria-pressed={aspectRatio === option}
                  className={`grid place-items-center content-center gap-[7px] min-w-0 aspect-square p-[8px_5px] border border-[rgba(139,151,169,.28)] bg-[rgba(8,11,17,.34)] text-[var(--dim)] cursor-pointer font-mono text-[8px] tracking-[.08em] transition-[border-color,background-color,color] duration-[160ms] ease-in-out hover:border-[rgba(255,92,154,.58)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--pink)] focus-visible:outline-offset-2 ${aspectRatio === option ? "border-[var(--pink)] bg-[rgba(0,0,0,.52)] text-[var(--pink)] shadow-[inset_0_0_0_1px_rgba(255,92,154,.12)]" : ""}`}
                  key={option}
                  onClick={() => changeAspectRatio(option)}
                  type="button"
                >
                  <span
                    className="block w-[68%] max-w-[54px] max-h-[54px] border border-current bg-[linear-gradient(135deg,rgba(255,92,154,.22),rgba(98,232,255,.1))]"
                    style={{ aspectRatio: option.replace(":", " / ") }}
                    aria-hidden="true"
                  />
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">MODEL SELECTS ASPECT RATIO</p>
        )}
        {canCustomizePortrait ? <div className="max-w-[420px]">
          <AiModelPicker
            campaignId={campaignId}
            capability="image"
            value={selectedModel}
            onChange={setSelectedModel}
            onModelOptionsChange={setSelectedModelOptions}
          />
        </div> : null}
      </div>
      <div className="grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-[10px] items-start max-[600px]:grid-cols-1">
        {previewUrl ? (
          <button
            className="w-full max-w-[420px] p-0 border-0 bg-transparent cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[var(--pink)] focus-visible:outline-offset-3"
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            aria-label="Open generated art preview"
          >
            <div
              className="w-full grid place-items-center overflow-hidden border border-[rgba(255,92,154,.28)] bg-[#0a1118] text-[var(--pink)]"
              style={{ aspectRatio: previewAspectRatio }}
            >
              <img
                className="block w-full h-full object-contain"
                src={previewUrl}
                alt="Selected generated art draft"
                onError={() => draft && void refreshDraftImage(draft.generationRunId)}
              />
            </div>
          </button>
        ) : (
          <div className="w-full max-w-[420px] aspect-square grid place-items-center border border-[rgba(255,92,154,.28)] bg-[#0a1118] bg-center bg-cover text-[var(--pink)] bg-[linear-gradient(135deg,rgba(255,92,154,.08),transparent_55%),repeating-linear-gradient(45deg,rgba(255,255,255,.035)_0_1px,transparent_1px_8px)]">
            <Sparkles size={18} />
            <span className="font-mono text-[8px] tracking-[.13em]">NO REVIEW DRAFT</span>
          </div>
        )}
        {gallery.length ? (
          <div
            aria-label="Generated image drafts"
            className="grid grid-cols-[repeat(auto-fill,64px)] auto-rows-[64px] content-start gap-2"
            role="group"
          >
            {gallery.map((entry, index) => {
              const thumbnailUrl = entry.draft.image.base64
                ? `data:${entry.draft.image.mediaType};base64,${entry.draft.image.base64}`
                : entry.draft.image.url;
              return (
                <button
                  key={entry.draft.generationRunId}
                  aria-label={`Select generated image ${index + 1}`}
                  aria-pressed={entry.draft.generationRunId === draft?.generationRunId}
                  className={`w-[64px] h-[64px] overflow-hidden border bg-[#0a1118] p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--pink)] focus-visible:outline-offset-2 ${entry.draft.generationRunId === draft?.generationRunId ? "border-[var(--pink)] shadow-[inset_0_0_0_1px_rgba(255,92,154,.3)]" : "border-[var(--line)] hover:border-[var(--cyan)]"}`}
                  type="button"
                  onClick={() => setDraft(entry.draft)}
                >
                  {thumbnailUrl ? (
                    <img
                      className="block w-full h-full object-cover"
                      src={thumbnailUrl}
                      alt=""
                      onError={() => void refreshDraftImage(entry.draft.generationRunId)}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {isPreviewOpen && previewUrl ? (
        <div
          className="fixed inset-0 z-[1000] grid place-items-center p-6 bg-[rgba(3,6,11,.88)]"
          role="dialog"
          aria-modal="true"
          aria-label="Generated art preview"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative grid place-items-center w-[96vw] max-w-[2048px] max-h-[calc(100vh-48px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="absolute top-[10px] right-[10px] z-[1] w-8 h-8 inline-grid place-items-center border border-transparent !bg-[rgba(8,11,17,.82)] !text-[var(--ink)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              aria-label="Close generated art preview"
            >
              <X size={18} />
            </button>
            <img
              className="block w-[96vw] max-w-full max-h-[calc(100vh-48px)] object-contain border border-[rgba(255,92,154,.45)] shadow-[0_24px_80px_rgba(0,0,0,.52)]"
              src={previewUrl}
              alt="Generated art draft enlarged"
              onError={() => draft && void refreshDraftImage(draft.generationRunId)}
            />
          </div>
        </div>
      ) : null}
      <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
        {isCharacterPortrait ? "Image description" : "Artwork description"}
        <textarea
          className="w-full min-h-[140px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--pink)] focus:shadow-[0_0_0_2px_rgba(255,92,154,.1)] placeholder:text-[#4d5a6b]"
          aria-label={isCharacterPortrait ? "Image description" : "Artwork description"}
          maxLength={1200}
          placeholder={isCharacterPortrait ? "Describe this saved character's appearance..." : "Describe the character, faction, mission, or scene..."}
          value={subjectDraft}
          onChange={(event) => {
            const nextSubject = event.target.value;
            if (onSubjectChange) onSubjectChange(nextSubject);
            else setLocalSubjectDraft(nextSubject);
          }}
        />
      </label>
      <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
        Focused refinement
        <textarea
          className="w-full min-h-[70px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--pink)] focus:shadow-[0_0_0_2px_rgba(255,92,154,.1)] placeholder:text-[#4d5a6b]"
          maxLength={600}
          placeholder="Shift the lighting, silhouette, palette, or mood..."
          value={refinement}
          onChange={(event) => setRefinement(event.target.value)}
        />
      </label>
      {error ? (
        <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.34)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)] min-h-[32px] !px-[10px] !text-[8px]"
          disabled={isGenerating || isApproving}
          onClick={() => void generate()}
          type="button"
        >
          {isGenerating ? (
            <>
              <LoaderCircle className="animate-spin" size={14} /> GENERATING...
            </>
          ) : (
            <>
              <Sparkles size={14} /> {canRefineSelectedDraft ? "REFINE DRAFT" : "GENERATE DRAFT"}
            </>
          )}
        </button>
        {draft ? (
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] min-h-[32px] !px-[10px] !text-[8px]"
            disabled={isGenerating || isApproving}
            onClick={() => void approve()}
            type="button"
          >
            {isApproving ? (
              <>
                <LoaderCircle className="animate-spin" size={14} /> ATTACHING...
              </>
            ) : (
              <>
                <UploadCloud size={14} /> APPROVE & ATTACH
              </>
            )}
          </button>
        ) : null}
      </div>
      {draft ? (
        <p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
          {draft.model.toUpperCase()} / {draft.aspectRatio} /{" "}
          {draft.image.mediaType} {" // "}{" "}
          {new Date(draft.createdAt).toLocaleTimeString()}
        </p>
      ) : null}
    </section>
  );
}

async function toImageFile(draft: ImageDraft) {
  if (draft.image.base64) {
    const bytes = Uint8Array.from(atob(draft.image.base64), (character) =>
      character.charCodeAt(0),
    );
    return new File(
      [bytes],
      `generated-art.${extensionForMediaType(draft.image.mediaType)}`,
      { type: draft.image.mediaType },
    );
  }

  if (!draft.image.url) {
    throw new Error("The art draft has no attachable image data.");
  }

  const response = await fetch(draft.image.url);
  if (!response.ok)
    throw new Error(
      "The generated image could not be downloaded for approval.",
    );
  const blob = await response.blob();
  const mediaType = blob.type || draft.image.mediaType;
  return new File([blob], `generated-art.${extensionForMediaType(mediaType)}`, {
    type: mediaType,
  });
}

function extensionForMediaType(mediaType: string) {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}
