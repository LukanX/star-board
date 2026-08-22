"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";
import { eyebrowClassName } from "@/components/ui/terminalStyles";

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
  requestFields?: Record<string, string | number | null | undefined>;
  currentDraft?: Record<string, string>;
  showModelPicker?: boolean;
  toolLabel?: string;
  onApply: (candidate: Record<string, string>) => void;
};

export default function AiDraftAssistant(props: AiDraftAssistantProps) {
  return (
    <AiDraftAssistantContent
      key={`${props.campaignId ?? "none"}:${props.endpoint}`}
      {...props}
    />
  );
}

function AiDraftAssistantContent({
  campaignId,
  endpoint,
  entityLabel,
  mode,
  fields,
  contextFields,
  requestFields,
  currentDraft,
  showModelPicker = true,
  toolLabel = "GM TOOL",
  onApply,
}: AiDraftAssistantProps) {
  const [focus, setFocus] = useState("");
  const [candidate, setCandidate] = useState<Record<string, string> | null>(
    null,
  );
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
          currentDraft:
            currentDraft && Object.keys(currentDraft).length
              ? currentDraft
              : undefined,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        model?: string;
        draft?: Record<string, unknown>;
      };

      if (!response.ok || !result.draft) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(
          retryAfter
            ? `${result.error ?? "AI assistance failed."} Retry in ${Math.ceil(Number(retryAfter) / 60)} minutes.`
            : (result.error ?? "AI assistance failed."),
        );
      }

      setLastModel(result.model ?? selectedModel);
      const nextCandidate: Record<string, string> = {};
      for (const field of fields) {
        const value = result.draft?.[field.key];
        nextCandidate[field.key] = typeof value === "string" ? value : "";
      }
      setCandidate(nextCandidate);
    } catch (generationError: unknown) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "AI assistance failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section
      data-ai-draft-assistant
      className="grid gap-[10px] mb-4 p-[13px] border border-[rgba(185,146,255,.3)] bg-[linear-gradient(120deg,rgba(185,146,255,.08),rgba(98,232,255,.035))] max-[760px]:p-3"
    >
      <div className="flex items-start justify-between gap-3 text-[var(--purple)]">
        <div>
          <p className={`${eyebrowClassName} !mb-[5px] text-[var(--purple)]`}>
            {toolLabel} {"//"} {entityLabel.toUpperCase()} DRAFT
          </p>
          <h3 className="m-0 text-[14px]">Build a starting point</h3>
        </div>
        <Sparkles size={17} />
      </div>
      <p className="m-0 text-[var(--muted)] text-[10px] leading-[1.5]">
        Review every field before applying this candidate to the editor. Nothing
        is saved until the record form is submitted.
      </p>
      {contextFields?.length ? (
        <div className="grid gap-2 p-[10px] border border-[rgba(98,232,255,.18)] bg-[rgba(98,232,255,.035)]">
          <p className="m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.12em]">
            CAMPAIGN CONTEXT
          </p>
          <div className="grid grid-cols-[minmax(120px,.7fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-2 max-[760px]:grid-cols-1">
            {contextFields.map((field) => (
              <label
                className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"
                key={field.key}
              >
                {field.label}
                <select
                  className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)]"
                  aria-label={field.label}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                >
                  {field.placeholder ? (
                    <option value="">{field.placeholder}</option>
                  ) : null}
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {showModelPicker ? (
        <AiModelPicker
          campaignId={campaignId}
          capability="structured-text"
          value={selectedModel}
          onChange={setSelectedModel}
        />
      ) : null}
      <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
        {toolLabel === "PLAYER TOOL" ? "Portrait direction" : "GM direction"}
        <textarea
          className="w-full min-h-[70px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b]"
          maxLength={600}
          placeholder={`What should this ${entityLabel.toLowerCase()} emphasize?`}
          value={focus}
          onChange={(event) => setFocus(event.target.value)}
        />
      </label>
      {candidate ? (
        <div className="grid gap-[10px] pt-[3px] border-t border-[rgba(185,146,255,.15)]">
          {fields.map((field) => (
            <label
              className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"
              key={field.key}
            >
              {field.label}
              {field.multiline ? (
                <textarea
                  className="w-full min-h-[70px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b] read-only:text-[var(--muted)] read-only:bg-[rgba(255,255,255,.025)]"
                  readOnly={field.readOnly}
                  maxLength={field.maxLength}
                  value={candidate[field.key] ?? ""}
                  onChange={(event) =>
                    setCandidate((current) =>
                      current
                        ? { ...current, [field.key]: event.target.value }
                        : current,
                    )
                  }
                />
              ) : (
                <input
                  className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b] read-only:text-[var(--muted)] read-only:bg-[rgba(255,255,255,.025)]"
                  readOnly={field.readOnly}
                  maxLength={field.maxLength}
                  value={candidate[field.key] ?? ""}
                  onChange={(event) =>
                    setCandidate((current) =>
                      current
                        ? { ...current, [field.key]: event.target.value }
                        : current,
                    )
                  }
                />
              )}
            </label>
          ))}
        </div>
      ) : (
        <div className="min-h-[65px] flex items-center gap-[9px] px-[11px] border border-dashed border-[rgba(185,146,255,.25)] text-[var(--purple)]">
          <Sparkles size={17} />
          <span className="font-mono text-[8px] tracking-[.13em]">
            NO CANDIDATE UNDER REVIEW
          </span>
        </div>
      )}
      {error ? (
        <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.34)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)] min-h-[32px] !px-[10px] !text-[8px] max-[420px]:w-full"
          disabled={isGenerating}
          onClick={() => void generate()}
          type="button"
        >
          {isGenerating ? (
            <>
              <LoaderCircle className="animate-spin" size={14} /> GENERATING...
            </>
          ) : (
            <>
              <Sparkles size={14} />{" "}
              {candidate ? "REGENERATE CANDIDATE" : "GENERATE CANDIDATE"}
            </>
          )}
        </button>
        {candidate ? (
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] min-h-[32px] !px-[10px] !text-[8px] max-[420px]:w-full"
            disabled={isGenerating}
            onClick={() => onApply(candidate)}
            type="button"
          >
            APPLY TO EDITOR
          </button>
        ) : null}
      </div>
      {lastModel ? (
        <p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.08em] [overflow-wrap:anywhere]">
          {lastModel.toUpperCase()} / REVIEW DRAFT
        </p>
      ) : null}
    </section>
  );
}
