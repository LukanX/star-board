"use client";
import { useState } from "react";
import { X } from "lucide-react";
import ReferenceCombobox from "@/components/ui/ReferenceCombobox";
import type { ReferenceBinding } from "@/lib/references/types";

export function EnemyAncestryReference({ campaignId, binding, disabled, onChange }: {
  campaignId: string; binding: ReferenceBinding | null; disabled: boolean;
  onChange: (binding: ReferenceBinding | null) => void;
}) {
  const [ancestryText, setAncestryText] = useState("");
  return <ReferenceCombobox campaignId={campaignId} kind="ancestry" label="Ancestry reference" value={ancestryText} binding={binding} disabled={disabled} onChange={(text, nextBinding) => { setAncestryText(text); onChange(nextBinding); }} />;
}

export function EnemyTraitReferences({ campaignId, bindings, names, disabled, traitsLocked, onTrait, onUnbind }: {
  campaignId: string; bindings: ReferenceBinding[]; names: Record<string, string>; disabled: boolean; traitsLocked: boolean;
  onTrait: (name: string, binding: ReferenceBinding) => void; onUnbind: (id: string) => void;
}) {
  const [traitText, setTraitText] = useState("");
  return <div className="grid min-w-0 content-start gap-2">
    <ReferenceCombobox campaignId={campaignId} kind="creature_trait" label="Add trait" value={traitText} disabled={disabled || traitsLocked || bindings.length >= 32} onChange={(text, binding) => { setTraitText(binding ? "" : text); if (binding) onTrait(text, binding); }} />
    {bindings.length ? <p className="m-0 text-[9px] text-[var(--muted)]">Removing a trait reference leaves its trait text unchanged.</p> : null}
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{bindings.map((binding) => <li key={binding.id} className="flex max-w-full items-center gap-2 border border-[var(--line)] p-2 text-xs [overflow-wrap:anywhere]">
      <span className="min-w-0">{names[binding.id] ?? binding.id}</span><button type="button" aria-label={`Remove ${names[binding.id] ?? binding.id} reference`} disabled={disabled} className="shrink-0 cursor-pointer text-[var(--cyan)] focus-visible:outline focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-60" onClick={() => onUnbind(binding.id)}><X size={14} aria-hidden="true" /></button>
    </li>)}</ul>
  </div>;
}
