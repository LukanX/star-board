"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Pin, PinOff, RotateCcw, Sparkles, Undo2 } from "lucide-react";
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

type DraftCheckpoint = {
  candidate: Record<string, string>;
  protectedFields: string[];
  contextValues: Record<string, string>;
};

type AiDraftAssistantProps = {
  campaignId: string | null;
  endpoint: string;
  entityLabel: string;
  mode: "create" | "refine";
  fields: AiDraftField[];
  briefFields?: AiDraftField[];
  contextFields?: AiDraftSelectField[];
  stageContextFields?: boolean;
  requestFields?: Record<string, string | number | null | undefined>;
  identityKey?: string;
  currentDraft?: Record<string, string>;
  protectedFieldKeys?: string[];
  open?: boolean;
  showModelPicker?: boolean;
  toolLabel?: string;
  descriptionOnly?: boolean;
  onBack?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onApplyContext?: (context: Record<string, string>) => void;
  onApply: (candidate: Record<string, string>) => void;
};

export function hasUsableDescription(
  candidate: Record<string, string>,
  fields: AiDraftField[],
) {
  return fields.some((field) => Boolean(candidate[field.key]?.trim()));
}

function valueAsString(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function valuesForFields(
  fields: AiDraftField[] | undefined,
  source: Record<string, string | number | null | undefined> | undefined,
) {
  if (!fields) return {};

  return Object.fromEntries(
    fields.map((field) => [field.key, valueAsString(source?.[field.key])]),
  );
}

function contextValuesForFields(fields: AiDraftSelectField[] | undefined) {
  return Object.fromEntries(
    (fields ?? []).map((field) => [field.key, field.value]),
  );
}

function sameContextValues(left: Record<string, string>, right: Record<string, string>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

export default function AiDraftAssistant(props: AiDraftAssistantProps) {
  return (
    <AiDraftAssistantContent
      key={`${props.campaignId ?? "none"}:${props.endpoint}:${props.identityKey ?? "default"}`}
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
  briefFields,
  contextFields,
  stageContextFields = false,
  requestFields,
  currentDraft,
  protectedFieldKeys = [],
  open = true,
  showModelPicker = true,
  toolLabel = "GM TOOL",
  descriptionOnly = false,
  onBack,
  onDirtyChange,
  onApplyContext,
  onApply,
}: AiDraftAssistantProps) {
  const [briefValues, setBriefValues] = useState<Record<string, string>>(() =>
    valuesForFields(briefFields, requestFields),
  );
  const [focus, setFocus] = useState("");
  const [feedback, setFeedback] = useState("");
  const [candidate, setCandidate] = useState<Record<string, string> | null>(
    null,
  );
  const [stagedContextValues, setStagedContextValues] = useState<Record<string, string>>(() =>
    contextValuesForFields(contextFields),
  );
  const [candidateContextValues, setCandidateContextValues] = useState<Record<string, string>>({});
  const [checkpoint, setCheckpoint] = useState<DraftCheckpoint | null>(null);
  const [protectedFields, setProtectedFields] = useState<string[]>(() => [
    ...protectedFieldKeys,
  ]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const markDirty = () => onDirtyChange?.(true);

  useEffect(() => () => {
    requestIdRef.current += 1;
    activeRequestRef.current?.abort();
  }, []);

  const visibleBriefValues = hasStarted
    ? briefValues
    : valuesForFields(briefFields, requestFields);
  const baseContextValues = contextValuesForFields(contextFields);
  const visibleContextValues = stageContextFields && hasStarted
    ? stagedContextValues
    : baseContextValues;
  const visibleContextFields = contextFields?.map((field) => ({
    ...field,
    value: visibleContextValues[field.key] ?? "",
  }));
  const visibleProtectedFields = hasStarted
    ? protectedFields
    : protectedFieldKeys;
  const candidateContextChanged = Boolean(
    stageContextFields && candidate && !sameContextValues(candidateContextValues, visibleContextValues),
  );

  const candidateFromResult = (
    draft: Record<string, unknown>,
  ): Record<string, string> =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        typeof draft[field.key] === "string" ? draft[field.key] : "",
      ]),
    ) as Record<string, string>;

  const requestFor = (revision: boolean) => {
    const seedValues = revision && candidate
      ? valuesForFields(briefFields, candidate)
      : visibleBriefValues;
    const baseline = revision ? candidate : currentDraft;

    return {
      campaignId,
      mode: revision ? "refine" : mode,
      ...requestFields,
      ...(stageContextFields
        ? Object.fromEntries(Object.entries(visibleContextValues).filter(([, value]) => value))
        : {}),
      ...seedValues,
      model: selectedModel ?? undefined,
      focus: revision ? undefined : focus.trim() || undefined,
      feedback: revision ? feedback.trim() || undefined : undefined,
      protectedFields: visibleProtectedFields.length ? visibleProtectedFields : undefined,
      currentDraft:
        baseline && Object.keys(baseline).length ? baseline : undefined,
    };
  };

  const generate = async (revision: boolean) => {
    if (!campaignId || isGenerating) {
      if (!campaignId) setError("Select a campaign before using AI assistance.");
      return;
    }

    const requestId = ++requestIdRef.current;
    activeRequestRef.current?.abort();
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    markDirty();
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify(requestFor(revision)),
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

      if (requestId !== requestIdRef.current) return;

      if (candidate) {
        setCheckpoint({ candidate, protectedFields: [...protectedFields], contextValues: { ...candidateContextValues } });
      }
      const nextCandidate = candidateFromResult(result.draft);
      setLastModel(result.model ?? selectedModel);
      setCandidate(nextCandidate);
      setCandidateContextValues({ ...visibleContextValues });
      setFeedback("");
      setBriefValues(valuesForFields(briefFields, nextCandidate));
      setProtectedFields([...visibleProtectedFields]);
      setHasStarted(true);
    } catch (generationError: unknown) {
      if (requestController.signal.aborted || requestId !== requestIdRef.current) return;
      if (!candidate && !hasStarted && !focus.trim()) onDirtyChange?.(false);
      setError(
        generationError instanceof Error
          ? generationError.message
          : "AI assistance failed.",
      );
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
        if (requestId === requestIdRef.current) setIsGenerating(false);
      }
    }
  };

  const updateCandidate = (key: string, value: string) => {
    markDirty();
    setCandidate((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleProtected = (key: string) => {
    markDirty();
    setHasStarted(true);
    setProtectedFields(
      visibleProtectedFields.includes(key)
        ? visibleProtectedFields.filter((field) => field !== key)
        : [...visibleProtectedFields, key],
    );
  };

  const undo = () => {
    if (!checkpoint || isGenerating) return;
    setCandidate(checkpoint.candidate);
    setCandidateContextValues(checkpoint.contextValues);
    setStagedContextValues(checkpoint.contextValues);
    setProtectedFields(checkpoint.protectedFields);
    setCheckpoint(null);
    setFeedback("");
    setError(null);
    setHasStarted(true);
    markDirty();
  };

  const apply = () => {
    if (!candidate || isGenerating || candidateContextChanged) return;
    if (descriptionOnly && !hasUsableDescription(candidate, fields)) {
      setError("Add an image description before using it.");
      return;
    }
    onApply(candidate);
    if (stageContextFields) onApplyContext?.(visibleContextValues);
    setBriefValues(valuesForFields(briefFields, candidate));
    setCandidate(null);
    setCandidateContextValues({});
    setStagedContextValues({ ...visibleContextValues });
    setCheckpoint(null);
    setFeedback("");
    setHasStarted(false);
    setFocus("");
    onDirtyChange?.(false);
    onBack?.();
  };

  return (
    <section
      aria-busy={isGenerating}
      aria-hidden={!open}
      data-ai-draft-assistant
      hidden={!open}
      className="grid gap-[10px] mb-4 p-[13px] border border-[rgba(185,146,255,.3)] bg-[linear-gradient(120deg,rgba(185,146,255,.08),rgba(98,232,255,.035))] max-[760px]:p-3"
    >
      <div className="flex items-start justify-between gap-3 text-[var(--purple)]">
        <div>
          <p className={`${eyebrowClassName} !mb-[5px] text-[var(--purple)]`}>
            {toolLabel} {"//"} {entityLabel.toUpperCase()} DRAFT WORKSPACE
          </p>
          <h3 className="m-0 text-[16px]">{descriptionOnly ? "Draft the image description" : "Shape a starting point"}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" size={17} />
          {onBack ? (
            <button
              aria-label="Back to editor"
              className="inline-flex min-h-[30px] items-center gap-1 border border-transparent bg-transparent px-2 text-[var(--muted)] font-mono text-[8px] tracking-[.08em] cursor-pointer hover:border-[var(--line)] hover:text-[var(--ink)]"
              disabled={isGenerating}
              onClick={onBack}
              title="Back to editor"
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={13} /> BACK
            </button>
          ) : null}
        </div>
      </div>
      <p className="m-0 text-[var(--muted)] text-[10px] leading-[1.5]">
        {descriptionOnly
          ? "Describe the image, review the wording, and use it in the generator. Nothing is saved until the character form is submitted."
          : "Describe the direction, review the result, and use it in the editor when it feels right. Nothing is saved until the record form is submitted."}
      </p>
      {!descriptionOnly && visibleContextFields?.length ? (
        <div className="grid gap-2 p-[10px] border border-[rgba(98,232,255,.18)] bg-[rgba(98,232,255,.035)]">
          <p className="m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.12em]">
            CAMPAIGN CONTEXT
          </p>
          <div className="grid grid-cols-[minmax(120px,.7fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-2 max-[760px]:grid-cols-1">
            {visibleContextFields.map((field) => (
              <label
                className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"
                key={field.key}
              >
                {field.label}
                <select
                  className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)]"
                  aria-label={field.label}
                  value={field.value}
                  disabled={isGenerating}
                  onChange={(event) => {
                    if (stageContextFields) {
                      markDirty();
                      setHasStarted(true);
                      setStagedContextValues((current) => ({ ...current, [field.key]: event.target.value }));
                    } else {
                      field.onChange(event.target.value);
                    }
                  }}
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
      {!descriptionOnly && briefFields?.length ? (
        <div className="grid gap-[10px] p-[11px] border border-[rgba(185,146,255,.2)] bg-[rgba(10,17,24,.48)]">
          <div>
            <p className="m-0 text-[var(--purple)] font-mono text-[8px] tracking-[.12em]">
              OPTIONAL STARTING DETAILS
            </p>
            <p className="m-0 mt-1 text-[var(--muted)] text-[10px]">
              Keep these short. Leave any blank and explain the vibe below.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-1">
            {briefFields.map((field) => (
              <label
                className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"
                key={field.key}
              >
                {field.label}
                <input
                  className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b]"
                  maxLength={field.maxLength}
                  value={visibleBriefValues[field.key] ?? ""}
                  onChange={(event) =>
                    (() => {
                      markDirty();
                      setHasStarted(true);
                      setBriefValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }));
                    })()
                  }
                />
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
        {descriptionOnly ? "Image description direction" : toolLabel === "PLAYER TOOL" ? "Portrait direction" : "GM direction"}
        <textarea
          className="w-full min-h-[70px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b]"
          maxLength={600}
          placeholder={`What should this ${entityLabel.toLowerCase()} emphasize?`}
          value={focus}
          onChange={(event) => {
            markDirty();
            setHasStarted(true);
            setFocus(event.target.value);
          }}
        />
      </label>
      {candidate ? (
        <div className="grid gap-[10px] pt-[3px] border-t border-[rgba(185,146,255,.15)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[var(--purple)] font-mono text-[8px] tracking-[.12em]">
                REVIEW CANDIDATE
              </p>
              <p className="m-0 mt-1 text-[var(--muted)] text-[10px]">
                {descriptionOnly ? "Edit the description directly before using it." : "Edit the wording directly. Pin anything the next revision must keep."}
              </p>
            </div>
            {checkpoint ? (
              <button
                aria-label="Undo last AI revision"
                className="inline-flex min-h-[30px] items-center gap-1 border border-[rgba(245,184,75,.4)] bg-[rgba(245,184,75,.08)] px-[9px] text-[var(--amber)] font-mono text-[8px] tracking-[.08em] cursor-pointer"
                disabled={isGenerating}
                onClick={undo}
                title="Undo last AI revision"
                type="button"
              >
                <Undo2 aria-hidden="true" size={13} /> UNDO
              </button>
            ) : null}
          </div>
          {candidateContextChanged ? (
            <p className="m-0 text-[var(--amber)] text-[10px]" role="status">
              The selected campaign context changed. Generate again before using this draft.
            </p>
          ) : null}
          {fields.map((field) => (
            <label
              className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"
              key={field.key}
            >
              <span className="flex items-center justify-between gap-2">
                <span>{field.label}</span>
                {!descriptionOnly && !field.readOnly ? (
                  <button
                    aria-label={`${visibleProtectedFields.includes(field.key) ? "Unpin" : "Keep"} ${field.label.toLowerCase()} unchanged`}
                    className={`inline-flex min-h-[26px] items-center gap-1 border bg-transparent px-2 font-mono text-[8px] tracking-[.06em] cursor-pointer ${visibleProtectedFields.includes(field.key) ? "border-[var(--amber)] text-[var(--amber)]" : "border-[var(--line)] text-[var(--dim)] hover:border-[var(--amber)] hover:text-[var(--amber)]"}`}
                    onClick={() => toggleProtected(field.key)}
                    title={`${visibleProtectedFields.includes(field.key) ? "Unpin" : "Keep"} ${field.label.toLowerCase()} unchanged during revisions`}
                    type="button"
                  >
                    {visibleProtectedFields.includes(field.key) ? <PinOff aria-hidden="true" size={12} /> : <Pin aria-hidden="true" size={12} />}
                    {visibleProtectedFields.includes(field.key) ? "PINNED" : "KEEP"}
                  </button>
                ) : null}
              </span>
              {field.multiline ? (
                <textarea
                  className="w-full min-h-[70px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b] read-only:text-[var(--muted)] read-only:bg-[rgba(255,255,255,.025)]"
                  readOnly={field.readOnly}
                  maxLength={field.maxLength}
                  value={candidate[field.key] ?? ""}
                  onChange={(event) => updateCandidate(field.key, event.target.value)}
                />
              ) : (
                <input
                  className="w-full h-[37px] border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--purple)] focus:shadow-[0_0_0_2px_rgba(185,146,255,.1)] placeholder:text-[#4d5a6b] read-only:text-[var(--muted)] read-only:bg-[rgba(255,255,255,.025)]"
                  readOnly={field.readOnly}
                  maxLength={field.maxLength}
                  value={candidate[field.key] ?? ""}
                  onChange={(event) => updateCandidate(field.key, event.target.value)}
                />
              )}
            </label>
          ))}
          <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
            WHAT SHOULD CHANGE?
            <textarea
              className="w-full min-h-[70px] resize-y border border-[rgba(139,151,169,.28)] outline-none p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] leading-[1.45] focus:border-[var(--pink)] focus:shadow-[0_0_0_2px_rgba(255,92,154,.1)] placeholder:text-[#4d5a6b]"
              maxLength={600}
              placeholder={`Example: make this ${entityLabel.toLowerCase()} warmer, stranger, or more useful at the table.`}
              value={feedback}
              onChange={(event) => {
                markDirty();
                setFeedback(event.target.value);
              }}
            />
          </label>
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
          className="h-[37px] inline-flex items-center justify-center gap-2 px-[12px] border border-[rgba(255,92,154,.34)] bg-[rgba(255,92,154,.08)] text-[var(--pink)] font-mono text-[9px] tracking-[.1em] cursor-pointer hover:border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)] min-h-[32px] max-[420px]:w-full"
          disabled={isGenerating}
          onClick={() => void generate(Boolean(candidate))}
          type="button"
        >
          {isGenerating ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" size={14} /> GENERATING...
            </>
          ) : (
            <>
              <Sparkles aria-hidden="true" size={14} /> {candidate ? (descriptionOnly ? "REVISE DESCRIPTION" : "REVISE DRAFT") : (descriptionOnly ? "GENERATE DESCRIPTION" : "GENERATE DRAFT")}
            </>
          )}
        </button>
          {candidate ? (
            <>
            {!descriptionOnly ? (
              <button
                className="h-[37px] inline-flex items-center justify-center gap-2 px-[12px] border border-[var(--line)] bg-[rgba(255,255,255,.035)] text-[var(--muted)] font-mono text-[9px] tracking-[.1em] cursor-pointer hover:border-[var(--cyan)] hover:text-[var(--ink)] min-h-[32px] max-[420px]:w-full"
                disabled={isGenerating}
                onClick={() => void generate(false)}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={13} /> NEW DRAFT
              </button>
            ) : null}
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[12px] border border-[var(--purple)] bg-[rgba(185,146,255,.12)] text-[var(--purple)] font-mono text-[9px] tracking-[.1em] cursor-pointer hover:bg-[rgba(185,146,255,.18)] min-h-[32px] max-[420px]:w-full"
              disabled={isGenerating || candidateContextChanged}
              onClick={apply}
              type="button"
            >
              {descriptionOnly ? "USE DESCRIPTION" : "USE DRAFT"}
            </button>
          </>
        ) : null}
        {onBack && !descriptionOnly ? (
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[12px] border border-transparent bg-transparent text-[var(--muted)] font-mono text-[9px] tracking-[.1em] cursor-pointer hover:border-[var(--line)] hover:text-[var(--ink)] min-h-[32px] max-[420px]:w-full"
            disabled={isGenerating}
            onClick={onBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={14} /> BACK TO EDITOR
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
