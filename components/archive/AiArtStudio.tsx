"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles, UploadCloud, X } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import {
  defaultImageAspectRatio,
  defaultImageSize,
  imageAspectRatioValues,
  imageSizeOptions,
  type ImageAspectRatio,
  type ImageSize,
} from "@/lib/ai/image-options";

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
  image: {
    base64: string | null;
    url: string | null;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
  };
  createdAt: string;
  temporaryPath?: string;
};

type ImageBackgroundJob = {
  generationRunId: string;
  status: "pending" | "running";
  targetKind: ArtKind;
  mode: "create" | "refine";
  subject: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  prompt: string;
  model: string;
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
type ImageValidationIssues =
  | ImageValidationIssue[]
  | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };

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

function wait(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

async function waitForImageBackgroundJob(
  job: ImageBackgroundJob,
): Promise<ImageDraft> {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    await wait(attempt === 0 ? 750 : 2500);

    const response = await fetch(
      `/api/ai/image/${encodeURIComponent(job.generationRunId)}`,
    );
    const result = (await response.json()) as {
      error?: string;
      job?: {
        status: "pending" | "running" | "complete" | "failed";
        model?: string;
        createdAt?: string;
        temporaryPath?: string;
        image?: ImageDraft["image"];
      };
    };

    if (!response.ok) {
      if (response.status >= 500) continue;
      throw new Error(
        result.error ?? "The image generation job could not be read.",
      );
    }

    if (result.job?.status === "failed") {
      throw new Error(
        result.error ?? "The image draft could not be generated.",
      );
    }

    if (
      result.job?.status === "complete" &&
      result.job.image?.url &&
      result.job.createdAt
    ) {
      return {
        generationRunId: job.generationRunId,
        targetKind: job.targetKind,
        mode: job.mode,
        subject: job.subject,
        aspectRatio: job.aspectRatio,
        size: job.size,
        prompt: job.prompt,
        provider: "openrouter",
        model: result.job.model ?? job.model,
        image: result.job.image,
        createdAt: result.job.createdAt,
        temporaryPath: result.job.temporaryPath,
      };
    }
  }

  throw new Error(
    "Image generation is taking longer than expected. Check the art studio again shortly.",
  );
}

async function removeTemporaryArt(
  campaignId: string,
  path: string | undefined,
) {
  if (!path) return;
  await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/art?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );
}

export default function AiArtStudio(props: AiArtStudioProps) {
  return (
    <AiArtStudioContent
      key={`${props.campaignId ?? "none"}:${props.kind}`}
      {...props}
    />
  );
}

function AiArtStudioContent({
  campaignId,
  kind,
  subject,
  currentPrompt,
  onSubjectChange,
  onApproved,
}: AiArtStudioProps) {
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(
    defaultImageAspectRatio,
  );
  const [size, setSize] = useState<ImageSize>(defaultImageSize);
  const [localSubjectDraft, setLocalSubjectDraft] = useState(subject ?? "");
  const [refinement, setRefinement] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectDraft = onSubjectChange ? (subject ?? "") : localSubjectDraft;
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
    const currentTier =
      imageSizeOptions[aspectRatio].find((option) => option.value === size)
        ?.tier ?? "1K";
    setAspectRatio(nextAspectRatio);
    setSize(
      imageSizeOptions[nextAspectRatio].find(
        (option) => option.tier === currentTier,
      )?.value ?? imageSizeOptions[nextAspectRatio][0].value,
    );
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
      const result = (await response.json()) as {
        error?: string;
        details?: string;
        issues?: ImageValidationIssues;
        draft?: ImageDraft;
        job?: ImageBackgroundJob;
      };

      if (response.status === 202 && result.job) {
        const nextDraft = await waitForImageBackgroundJob(result.job);
        if (draft?.temporaryPath)
          void removeTemporaryArt(campaignId, draft.temporaryPath);
        setDraft(nextDraft);
        return;
      }

      if (!response.ok || !result.draft) {
        const issueDetails = formatImageValidationIssues(result.issues);
        throw new Error(
          [
            result.error ?? "The art draft could not be generated.",
            result.details,
            issueDetails,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }

      setDraft(result.draft);
    } catch (generationError: unknown) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "The art draft could not be generated.",
      );
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

      await removeTemporaryArt(campaignId, draft.temporaryPath);
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

  return (
    <section className="grid gap-[10px] p-[13px] border border-[rgba(255,92,154,.3)] bg-[linear-gradient(120deg,rgba(255,92,154,.07),rgba(185,146,255,.035))]">
      <div className="flex items-start justify-between gap-3 text-[var(--pink)]">
        <div>
          <p className={`${eyebrowClassName} !mb-[5px] text-[var(--pink)]`}>GM TOOL // IMAGE DRAFT</p>
          <h3 className="m-0 text-[14px]">Shape the visual signal</h3>
        </div>
        <Sparkles size={17} />
      </div>
      <div className="grid gap-[10px]">
        <fieldset className="grid gap-2 min-w-0 m-0 p-0 border-0">
          <legend className="p-0 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">ASPECT RATIO</legend>
          <div
            className="grid grid-cols-4 gap-2 w-full max-w-[480px] min-w-0 max-[760px]:grid-cols-2"
            aria-label="Image aspect ratio"
            role="group"
          >
            {imageAspectRatioValues.map((option) => (
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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)] gap-[10px] items-start">
          <AiModelPicker
            campaignId={campaignId}
            capability="image"
            value={selectedModel}
            onChange={setSelectedModel}
          />
          <label>
            OUTPUT SIZE
            <select
              className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none px-[10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--pink)] focus:shadow-[0_0_0_2px_rgba(255,92,154,.1)]"
              aria-label="Image output size"
              value={size}
              onChange={(event) => setSize(event.target.value as ImageSize)}
            >
              {availableSizes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {previewUrl ? (
        <button
          className="w-full max-w-[420px] p-0 border-0 bg-transparent cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[var(--pink)] focus-visible:outline-offset-3"
          type="button"
          onClick={() => setIsPreviewOpen(true)}
          aria-label="Open generated art preview"
        >
          <div
            className="w-full aspect-square grid place-items-center border border-[rgba(255,92,154,.28)] bg-[#0a1118] bg-center bg-cover text-[var(--pink)]"
            style={{
              backgroundImage: `url(${previewUrl})`,
              aspectRatio: previewAspectRatio,
            }}
            role="img"
            aria-label="Generated art draft"
          />
        </button>
      ) : (
        <div className="w-full max-w-[420px] aspect-square grid place-items-center border border-[rgba(255,92,154,.28)] bg-[#0a1118] bg-center bg-cover text-[var(--pink)] bg-[linear-gradient(135deg,rgba(255,92,154,.08),transparent_55%),repeating-linear-gradient(45deg,rgba(255,255,255,.035)_0_1px,transparent_1px_8px)]">
          <Sparkles size={18} />
          <span className="font-mono text-[8px] tracking-[.13em]">NO REVIEW DRAFT</span>
        </div>
      )}
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
            />
          </div>
        </div>
      ) : null}
      <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
        Visual subject
        <input
          className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--pink)] focus:shadow-[0_0_0_2px_rgba(255,92,154,.1)] placeholder:text-[#4d5a6b]"
          maxLength={1200}
          placeholder="Describe the character, faction, mission, or scene..."
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
          onClick={() => void generate(draft ? "refine" : "create")}
          type="button"
        >
          {isGenerating ? (
            <>
              <LoaderCircle className="animate-spin" size={14} /> GENERATING...
            </>
          ) : (
            <>
              <Sparkles size={14} /> {draft ? "REFINE DRAFT" : "GENERATE DRAFT"}
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
          {draft.model.toUpperCase()} / {draft.aspectRatio} / {draft.size} /{" "}
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
