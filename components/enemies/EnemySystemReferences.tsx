"use client";
import { useState } from "react";
import ReferenceCombobox from "@/components/ui/ReferenceCombobox";
import type { ReferenceBinding } from "@/lib/references/types";
import type { EnemyReferenceSelections } from "@/lib/validation/reference";

export default function EnemySystemReferences({ campaignId, value, names, disabled, traitsLocked, onAncestry, onTrait, onUnbind }: {
  campaignId: string; value: EnemyReferenceSelections; names: Record<string, string>; disabled: boolean; traitsLocked: boolean;
  onAncestry: (binding: ReferenceBinding | null) => void; onTrait: (name: string, binding: ReferenceBinding) => void; onUnbind: (id: string) => void;
}) {
  const [ancestryText, setAncestryText] = useState("");
  const [traitText, setTraitText] = useState("");
  return <section className="mb-4 grid gap-3 border border-[var(--line)] bg-[var(--panel)] p-3">
    <h3 className="m-0 font-mono text-xs text-[var(--cyan)]">SYSTEM REFERENCES</h3>
    <p className="m-0 text-xs text-[var(--muted)]">Optional explicit bindings. Campaign AI settings control appearance, lore and trait context. These do not change imported rules.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <ReferenceCombobox campaignId={campaignId} kind="ancestry" label="Ancestry reference" value={ancestryText} binding={value.ancestry} disabled={disabled} onChange={(text, binding) => { setAncestryText(text); onAncestry(binding); }} />
      <ReferenceCombobox campaignId={campaignId} kind="creature_trait" label="Bind a creature trait" value={traitText} disabled={disabled || traitsLocked || value.creatureTraits.length >= 32} onChange={(text, binding) => { setTraitText(binding ? "" : text); if (binding) onTrait(text, binding); }} />
    </div>
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{value.creatureTraits.map((binding) => <li key={binding.id} className="flex max-w-full items-center gap-2 border border-[var(--line)] p-2 text-xs [overflow-wrap:anywhere]">
      <span>{names[binding.id] ?? binding.id} · {binding.id.split(".").at(-1)}</span><button type="button" aria-label={`Unbind ${names[binding.id] ?? binding.id}`} disabled={disabled} className="text-[var(--cyan)] underline" onClick={() => onUnbind(binding.id)}>Unbind</button>
    </li>)}</ul>
  </section>;
}
