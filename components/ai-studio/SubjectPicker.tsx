"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import VisualAsset from "@/components/ui/VisualAsset";
import type { StudioSubjectOption } from "@/lib/ai/studio-context";
import { studioSubjectKinds, type StudioSubjectKind } from "@/lib/validation/studio";
import { studioGhostButton, studioInput, studioKindIcons, studioKindLabels, studioKindTones, studioLabel } from "./studioStyles";

export default function SubjectPicker({ campaignId, onSelect, placesOnly = false, disabled = false, selectedKeys = [] }: {
  campaignId: string; onSelect: (subject: StudioSubjectOption) => void; placesOnly?: boolean; disabled?: boolean; selectedKeys?: string[];
}) {
  const [kind, setKind] = useState<StudioSubjectKind>("place");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<StudioSubjectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const activeKind = placesOnly ? "place" : kind;
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      const query = new URLSearchParams({ kind: activeKind, search, offset: String(offset) });
      void fetch(`/api/campaigns/${campaignId}/studio/subjects?${query}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const result = await response.json() as { subjects?: StudioSubjectOption[]; error?: string };
          if (!response.ok || !result.subjects) throw new Error(result.error ?? "Subjects could not be loaded.");
          setRows(result.subjects);
        })
        .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Subjects could not be loaded."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [campaignId, activeKind, search, offset]);
  return <div className="min-w-0 space-y-3">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      {!placesOnly && <label className={studioLabel}>Subject type<select className={studioInput} value={kind} disabled={disabled} onChange={(event) => { setKind(event.target.value as StudioSubjectKind); setOffset(0); }}>
        {studioSubjectKinds.map((value) => <option key={value} value={value}>{value === "enemy" ? "Enemies / monsters" : value === "npc" ? "NPCs" : `${studioKindLabels[value]}s`}</option>)}
      </select></label>}
      <label className={`${studioLabel} ${placesOnly ? "sm:col-span-2" : ""}`}>Search subjects
        <span className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-[var(--dim)]" size={14} />
          <input className={`${studioInput} pl-9`} value={search} disabled={disabled} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} maxLength={100} placeholder={placesOnly ? "Find a Place" : "Find by name"} />
        </span>
      </label>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--pink)]">{error}</p>}
    {loading ? <p role="status" className={studioLabel}>Loading subjects...</p> : <ul className="m-0 grid max-h-64 list-none grid-cols-1 gap-2 overflow-y-auto p-0 sm:grid-cols-2">
      {rows.map((row) => {
        const Icon = studioKindIcons[row.kind];
        const added = selectedKeys.includes(`${row.kind}:${row.id}`);
        return <li key={`${row.kind}:${row.id}`} className="min-w-0">
          <button type="button" aria-label={added ? `${row.name} added` : `Add ${row.name}`} disabled={disabled || added} onClick={() => onSelect(row)}
            className="group flex w-full min-w-0 items-center gap-3 border border-[var(--line)] bg-[var(--background)] p-2 text-left hover:border-[var(--cyan)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-60">
            <VisualAsset src={row.thumbnailUrl ?? null} label={`${row.name} artwork`} className="h-11 w-11 shrink-0 bg-cover" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--ink)]">{row.name}</span>
              <span className={`mt-1 inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] tracking-[.1em] ${studioKindTones[row.kind]}`}><Icon aria-hidden="true" size={10} />{studioKindLabels[row.kind].toUpperCase()}</span>
            </span>
            {added ? <Check aria-hidden="true" className="text-[var(--green)]" size={16} /> : <Plus aria-hidden="true" className="text-[var(--dim)] group-hover:text-[var(--cyan)]" size={16} />}
          </button>
        </li>;
      })}
      {!rows.length && !error && <li className={`${studioLabel} sm:col-span-2`}>No matching subjects. You can still write a freeform direction.</li>}
    </ul>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={studioGhostButton} disabled={disabled || offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - 20))}><ChevronLeft aria-hidden="true" size={14} />Previous subjects</button>
      <button type="button" className={studioGhostButton} disabled={disabled || rows.length < 20 || loading} onClick={() => setOffset((value) => value + 20)}>Next subjects<ChevronRight aria-hidden="true" size={14} /></button>
    </div>
  </div>;
}
