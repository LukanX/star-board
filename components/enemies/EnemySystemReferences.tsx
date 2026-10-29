"use client";
import { useState } from "react";
import ReferenceCombobox from "@/components/ui/ReferenceCombobox";
import type { ReferenceBinding } from "@/lib/references/types";

export function EnemyAncestryReference({ campaignId, binding, disabled, onChange }: {
  campaignId: string; binding: ReferenceBinding | null; disabled: boolean;
  onChange: (binding: ReferenceBinding | null, name: string) => boolean;
}) {
  const [ancestryText, setAncestryText] = useState("");
  return <ReferenceCombobox campaignId={campaignId} kind="ancestry" label="Ancestry reference (optional)" value={ancestryText} binding={binding} disabled={disabled} onChange={(text, nextBinding) => { if (onChange(nextBinding, text)) setAncestryText(text); }} />;
}
