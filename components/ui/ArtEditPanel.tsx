"use client";

import { useId } from "react";
import { LoaderCircle, Wand2 } from "lucide-react";
import { imageEditInstructionMaxLength } from "@/lib/validation/image";

type Tone = "cyan" | "pink";

const tones: Record<Tone, { frame: string; accent: string; button: string; field: string }> = {
  cyan: {
    frame: "border-[var(--line)] bg-[var(--background)]/40",
    accent: "text-[var(--cyan)]",
    button: "border-[var(--cyan)] text-[var(--cyan)] hover:bg-[var(--cyan)]/10 focus-visible:outline-[var(--cyan)]",
    field: "focus-visible:outline-[var(--cyan)]",
  },
  pink: {
    frame: "border-[rgba(255,92,154,.3)] bg-[rgba(255,92,154,.04)]",
    accent: "text-[var(--pink)]",
    button: "border-[rgba(255,92,154,.5)] text-[var(--pink)] hover:bg-[rgba(255,92,154,.1)] focus-visible:outline-[var(--pink)]",
    field: "focus-visible:outline-[var(--pink)]",
  },
};

export type ArtEditPanelProps = {
  tone?: Tone;
  sourceLabel: string;
  instruction: string;
  busy: boolean;
  disabled?: boolean;
  blockedReason?: string | null;
  onInstructionChange: (value: string) => void;
  onSubmit: () => void;
  children?: React.ReactNode;
};

export default function ArtEditPanel({ tone = "cyan", sourceLabel, instruction, busy, disabled = false, blockedReason, onInstructionChange, onSubmit, children }: ArtEditPanelProps) {
  const id = useId();
  const styles = tones[tone];
  const blocked = Boolean(blockedReason);
  const canSubmit = !busy && !disabled && !blocked && instruction.trim().length > 0;

  return (
    <section aria-labelledby={`${id}-title`} className={`grid min-w-0 gap-2 border p-3 ${styles.frame}`}>
      <h4 id={`${id}-title`} className={`m-0 font-mono text-[10px] tracking-[.11em] ${styles.accent}`}>EDIT WITH AI</h4>
      <p className="m-0 break-words font-mono text-[10px] text-[var(--dim)]">EDITING // {sourceLabel}</p>
      {children}
      <label className="grid gap-1 text-xs text-[var(--muted)]" htmlFor={`${id}-instruction`}>
        Describe the change
        <textarea
          id={`${id}-instruction`}
          className={`min-h-[72px] w-full min-w-0 resize-y border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus-visible:outline-2 disabled:opacity-50 ${styles.field}`}
          maxLength={imageEditInstructionMaxLength}
          placeholder="Change the jacket to red, add rain, remove the helmet..."
          value={instruction}
          disabled={busy || disabled || blocked}
          onChange={(event) => onInstructionChange(event.target.value)}
        />
        <span className="justify-self-end font-mono text-[9px] text-[var(--dim)]">{instruction.length}/{imageEditInstructionMaxLength}</span>
      </label>
      {blocked ? <p className="m-0 text-xs text-[var(--amber)]" role="status">{blockedReason}</p> : null}
      <div>
        <button
          type="button"
          className={`inline-flex min-h-9 items-center justify-center gap-2 border px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${styles.button}`}
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {busy ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={14} />EDITING...</> : <><Wand2 aria-hidden="true" size={14} />APPLY EDIT</>}
        </button>
      </div>
    </section>
  );
}
