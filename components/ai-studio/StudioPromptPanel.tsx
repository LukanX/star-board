"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, Copy, Lock, Pencil, RefreshCw, Sparkles } from "lucide-react";
import type { StudioPromptSection, StudioSubjectDefaults } from "@/lib/ai/studio-context";
import { studioBadge, studioGhostButton, studioMicro, studioPanel, studioPrimaryButton } from "./studioStyles";

export type StudioPreview = {
  prompt: string; length: number; limit: number; overBy: number; directionMissing: boolean;
  sections: StudioPromptSection[]; defaults: { style: string; subjects: StudioSubjectDefaults[] }; error?: string;
};

type BudgetState = "fits" | "trimmed" | "over";
const meterTones: Record<BudgetState, string> = { fits: "bg-[var(--green)]", trimmed: "bg-[var(--amber)]", over: "bg-[var(--pink)]" };
const statusTones: Record<BudgetState, string> = { fits: "text-[var(--green)]", trimmed: "text-[var(--amber)]", over: "text-[var(--pink)]" };

export default function StudioPromptPanel({ preview, current, loading, error, generationError, busy, canGenerate, blocker, onEdit, onRefresh, onGenerate, generationSettings }: {
  preview: StudioPreview | null; current: boolean; loading: boolean; error: string | null; generationError: string | null; busy: string | null;
  canGenerate: boolean; blocker: string | null; onEdit: (sectionId: string) => void; onRefresh: () => void; onGenerate: () => void;
  generationSettings?: ReactNode;
}) {
  const tooltipId = useId();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const trimmed = preview?.sections.filter((section) => section.trimmed) ?? [];
  const state: BudgetState = !preview ? "fits" : preview.overBy > 0 ? "over" : trimmed.length ? "trimmed" : "fits";
  const percent = preview ? Math.min(100, Math.round((preview.length / preview.limit) * 100)) : 0;
  async function copy() {
    if (!preview) return;
    try { await navigator.clipboard.writeText(preview.prompt); setCopyError(null); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch (failure) { setCopied(false); setCopyError(failure instanceof Error ? failure.message : "The prompt could not be copied."); }
  }
  return <aside aria-label="Prompt preview" className={`${studioPanel} flex min-w-0 flex-col gap-4`}>
    <div className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 flex items-center gap-2 text-sm font-semibold tracking-[.08em]"><Sparkles aria-hidden="true" className="text-[var(--cyan)]" size={16} />PROMPT</h2>
      <button type="button" className={studioGhostButton} onClick={onRefresh} disabled={loading}><RefreshCw aria-hidden="true" size={12} className={loading ? "animate-spin" : ""} />Refresh preview</button>
    </header>
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={studioMicro}>BUDGET</span>
        <span className="font-mono text-xs text-[var(--ink)]">{preview ? `${preview.length.toLocaleString()} / ${preview.limit.toLocaleString()}` : "— / 3,000"}</span>
      </div>
      <div role="meter" aria-label="Prompt length" aria-valuemin={0} aria-valuemax={preview?.limit ?? 3000} aria-valuenow={preview?.length ?? 0} className="h-1.5 w-full bg-[var(--line)]">
        <div className={`h-full transition-[width] duration-300 ${meterTones[state]}`} style={{ width: `${percent}%` }} />
      </div>
      <p role="status" className={`m-0 text-xs ${statusTones[state]}`}>
        {loading ? "Updating preview..." : !preview ? "Preview appears as you compose." : state === "over"
          ? `${preview.overBy} characters over even after auto-fit.`
          : state === "trimmed" ? `Auto-fit trimmed ${trimmed.length} section${trimmed.length === 1 ? "" : "s"}. Edit them to choose what is kept.` : "Everything fits untrimmed."}
      </p>
    </div>
    {error && <p role="alert" className="break-words text-sm text-[var(--pink)]">{error}</p>}
    {preview && !current && <p role="status" className="text-xs text-[var(--amber)]">Preview is stale. Generation waits for your latest composition.</p>}
    {trimmed.length > 0 && <ul className="m-0 list-none space-y-2 p-0" aria-label="Auto-fit changes">
      {trimmed.map((section) => <li key={section.id} className="flex flex-wrap items-center gap-2 text-xs text-[var(--amber)]">
        <span className="min-w-0 break-words">{section.label}</span>
        <span className={studioBadge}>TRIMMED {section.originalLength}→{section.includedLength}</span>
        {section.editable && <button type="button" className={studioGhostButton} aria-label={`Edit ${section.label}`} onClick={() => onEdit(section.id)}><Pencil aria-hidden="true" size={11} />Edit</button>}
      </li>)}
    </ul>}
    {preview && <details className="min-w-0 border border-[var(--line)]">
      <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--muted)]">Final prompt</summary>
      <div className="min-w-0 space-y-3 border-t border-[var(--line)] p-3">
      <ul className="m-0 list-none space-y-1.5 p-0" aria-label="Prompt sections">
      {preview.sections.map((section) => <li key={section.id} className="flex min-w-0 items-center gap-2 border-l-2 border-[var(--line)] py-1 pl-2 text-xs data-[trimmed=true]:border-[var(--amber)]" data-trimmed={section.trimmed}>
        {section.editable ? null : <Lock aria-label="Locked" className="shrink-0 text-[var(--dim)]" size={12} />}
        <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{section.label}</span>
        <span className="font-mono text-[10px] text-[var(--dim)]">{section.text.length}</span>
        {section.editable && !section.trimmed && <button type="button" className={studioGhostButton} aria-label={`Edit ${section.label}`} onClick={() => onEdit(section.id)}><Pencil aria-hidden="true" size={11} /></button>}
      </li>)}
    </ul>
        <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--muted)]">{preview.prompt}</pre>
        <button type="button" className={`${studioGhostButton} mt-2`} onClick={() => void copy()}>{copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}{copied ? "Copied" : "Copy prompt"}</button>
        {copyError && <p role="alert" className="break-words text-xs text-[var(--pink)]">{copyError}</p>}
      </div>
    </details>}
    </div>
    <div className="shrink-0 space-y-2 border-t border-[var(--line)] pt-4">
      {generationSettings}
      <div role="group" aria-label="Image generation action" tabIndex={!canGenerate ? 0 : undefined} aria-describedby={!canGenerate ? tooltipId : undefined}
        className="relative space-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
        onPointerEnter={() => setTooltipOpen(true)} onPointerLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)} onBlur={() => setTooltipOpen(false)}
        onPointerDown={(event) => { if (event.pointerType === "touch") setTooltipOpen((open) => !open); }}
        onKeyDown={(event) => { if (event.key === "Escape") setTooltipOpen(false); }}>
        {generationError && <p role="alert" className="m-0 break-words border border-[var(--pink)]/50 p-3 text-sm text-[var(--pink)]">{generationError}</p>}
        <button type="button" className={`${studioPrimaryButton} w-full disabled:pointer-events-none`} disabled={!canGenerate} onClick={onGenerate}>Generate image draft</button>
        {!canGenerate && blocker && <span id={tooltipId} role="tooltip" hidden={!tooltipOpen} className="absolute bottom-full left-0 right-0 z-30 mb-2 border border-[var(--amber)]/50 bg-[var(--background)] p-3 text-xs leading-relaxed text-[var(--ink)]">{blocker}</span>}
      </div>
      {busy ? <p role="status" className="m-0 text-xs text-[var(--cyan)]">{busy} Images may take several minutes.</p>
        : blocker && <p className="m-0 text-xs text-[var(--muted)]">{blocker}</p>}
      <p className="m-0 text-[11px] text-[var(--dim)]">Generation creates a temporary draft only. It never saves, publishes or replaces existing art.</p>
    </div>
  </aside>;
}
