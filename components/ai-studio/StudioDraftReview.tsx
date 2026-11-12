"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import ArtEditPanel from "@/components/ui/ArtEditPanel";
import VisualAsset from "@/components/ui/VisualAsset";
import FoundryExport from "./FoundryExport";
import type { ImageDraft } from "@/lib/ai/image-job-polling";
import { studioButton, studioGhostButton, studioInput, studioLabel, studioPanel, studioPrimaryButton } from "./studioStyles";

export default function StudioDraftReview({ jobs, drafts, selectedId, busy, title, caption, editInstruction, editBlockedReason, editSettings, onSelect, onTitle, onCaption, onEditInstruction, onSave, onDiscard, onForget, onRedo, onEdit }: {
  jobs: { generationRunId: string }[]; drafts: ImageDraft[]; selectedId: string | null; busy: string | null;
  title: string; caption: string; editInstruction: string; editBlockedReason: string | null; onSelect: (id: string) => void; onTitle: (value: string) => void; onCaption: (value: string) => void;
  onEditInstruction: (value: string) => void;
  editSettings?: ReactNode;
  onSave: () => void; onDiscard: () => void; onForget: () => void; onRedo: () => void; onEdit: () => void;
}) {
  const selected = drafts.find((draft) => draft.generationRunId === selectedId) ?? null;
  const unavailable = jobs.some((job) => !drafts.some((draft) => draft.generationRunId === job.generationRunId));
  const [captionOpen, setCaptionOpen] = useState(false);
  return <div className="min-w-0 space-y-4">
    {jobs.length > 1 && <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pb-2" aria-label="Draft thumbnails">
      {jobs.map((job, index) => {
        const draft = drafts.find((value) => value.generationRunId === job.generationRunId);
        return <li key={job.generationRunId} className="shrink-0">
          <button type="button" aria-label={`Draft ${index + 1}`} aria-pressed={selectedId === job.generationRunId} disabled={!!busy || !draft} onClick={() => onSelect(job.generationRunId)}
            className="relative block h-24 w-24 border border-[var(--line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] aria-pressed:border-[var(--cyan)] aria-pressed:shadow-[0_0_0_1px_var(--cyan)] disabled:cursor-not-allowed sm:h-28 sm:w-28">
            {draft
              ? <VisualAsset src={draft.image.url ?? `data:${draft.image.mediaType};base64,${draft.image.base64}`} label={`Draft ${index + 1} thumbnail`} className="h-full w-full bg-cover" />
              : <span className="grid h-full w-full place-items-center bg-[var(--background)] text-[var(--dim)]">{busy ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : <AlertTriangle aria-hidden="true" size={18} />}</span>}
            <span className="absolute bottom-0 left-0 bg-[var(--background)]/85 px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink)]">{index + 1}</span>
          </button>
        </li>;
      })}
    </ul>}
    {unavailable && !busy && <button type="button" className={studioGhostButton} onClick={onForget}>Forget unavailable drafts</button>}
    {selected ? <div className="grid min-w-0 gap-4">
      <VisualAsset src={selected.image.url ?? `data:${selected.image.mediaType};base64,${selected.image.base64}`} label="Generated Studio review draft" downloadName="Studio draft" className="aspect-square max-h-[620px] w-full border border-[var(--line)] bg-contain" />
      <div className="min-w-0 space-y-3">
        <p className="m-0 text-xs text-[var(--amber)]">Draft only. Review for accuracy and spoilers before saving.</p>
        <p className="m-0 break-words font-mono text-[10px] text-[var(--dim)]">{selected.model}{selected.resolution ? ` / ${selected.resolution}` : ""}</p>
        {selected.targetKind === "battlemap" && <FoundryExport src={selected.image.url ?? `data:${selected.image.mediaType};base64,${selected.image.base64}`}
          name={title.trim() || "Studio battlemap"} disabled={!!busy} />}
        <section aria-label="Add to campaign library" className={`${studioPanel} min-w-0 space-y-3`}>
          <h3 className="m-0 text-sm">Add to campaign library</h3>
          <label className={studioLabel}>Artwork title<input className={studioInput} maxLength={160} value={title} onChange={(event) => onTitle(event.target.value)} disabled={!!busy} /></label>
          <button type="button" className={studioGhostButton} aria-expanded={captionOpen} disabled={!!busy} onClick={() => setCaptionOpen((open) => !open)}>
            {captionOpen ? "Hide caption" : "+ Add caption"}
          </button>
          {captionOpen && <label className={studioLabel}>Artwork caption<textarea className={studioInput} rows={3} maxLength={2000} value={caption} onChange={(event) => onCaption(event.target.value)} disabled={!!busy} /></label>}
          {!title.trim() && <p role="status" className="m-0 text-xs text-[var(--amber)]">Name this image before it can be added to your campaign library.</p>}
          <button type="button" className={studioPrimaryButton} disabled={!!busy || !title.trim()} onClick={onSave}>Add to library</button>
        </section>
        <details className="min-w-0 border border-[var(--line)]">
          <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--muted)]">Original generation details</summary>
          <pre className="m-0 whitespace-pre-wrap break-words p-3 text-xs text-[var(--muted)]">{selected.prompt}</pre>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={studioButton} disabled={!!busy} onClick={onDiscard}>Discard image draft</button>
          <button type="button" className={studioButton} disabled={!!busy} onClick={onRedo}><RotateCcw aria-hidden="true" size={12} />Redo with changes</button>
        </div>
        <ArtEditPanel
          tone="cyan"
          sourceLabel={selected.operation === "edit" ? "THIS EDITED DRAFT" : "THIS DRAFT"}
          instruction={editInstruction}
          busy={busy === "Editing image..."}
          disabled={!!busy}
          blockedReason={editBlockedReason}
          onInstructionChange={onEditInstruction}
          onSubmit={onEdit}
        >{editSettings}</ArtEditPanel>
      </div>
    </div> : <p className={studioLabel}>Select a completed draft to review it.</p>}
  </div>;
}
