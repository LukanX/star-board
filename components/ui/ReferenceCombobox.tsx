"use client";

import { useEffect, useId, useState } from "react";
import { referenceSearchResponseSchema } from "@/lib/validation/reference";
import type { ReferenceBinding, ReferenceCandidate, ReferenceKind } from "@/lib/references/types";

type Props = {
  campaignId: string;
  kind: ReferenceKind | "creature_trait";
  label: string;
  value: string;
  binding?: ReferenceBinding | null;
  disabled?: boolean;
  onChange: (text: string, binding: ReferenceBinding | null) => void;
};

export default function ReferenceCombobox({ campaignId, kind, label, value, binding, disabled = false, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify({ campaignId, kind, value, binding, retry });
  const [result, setResult] = useState<{ key: string; results: ReferenceCandidate[]; error?: string } | null>(null);
  const pending = result?.key !== key;
  const options = pending ? [] : result.results;
  const error = pending ? undefined : result.error;
  const selected = options.find((entry) => entry.binding.id === binding?.id);
  const expanded = open && !disabled;
  const activeOption = Math.min(active, Math.max(0, options.length - 1));

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind, q: value, limit: "20" });
        if (binding) {
          params.set("id", binding.id);
          params.set("catalogVersion", binding.catalogVersion);
        }
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/references?${params}`, { signal: controller.signal, cache: "no-store" });
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Reference lookup failed.";
          throw new Error(message);
        }
        const parsed = referenceSearchResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error("The reference lookup response was invalid.");
        if (!controller.signal.aborted) setResult({ key, results: parsed.data.results });
      } catch (failure) {
        if (!controller.signal.aborted) setResult({ key, results: [], error: failure instanceof Error ? failure.message : "Reference lookup failed." });
      }
    }, 180);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [binding, campaignId, key, kind, value]);

  function choose(candidate: ReferenceCandidate) {
    onChange(candidate.name, candidate.binding);
    setOpen(false);
    setActive(0);
  }

  return (
    <div className="relative grid min-w-0 content-start gap-[7px]" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label htmlFor={id} className="text-[var(--dim)] font-mono text-[8px] tracking-[.12em]">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-options`}
        aria-describedby={`${id}-status`}
        aria-activedescendant={expanded && options.length ? `${id}-option-${activeOption}` : undefined}
        autoComplete="off"
        maxLength={kind === "ancestry" ? 120 : 160}
        className="w-full min-w-0 h-[42px] border border-[rgba(139,151,169,.28)] bg-[#0a1118] px-[10px] text-[var(--ink)] font-mono text-[11px] outline-none focus-visible:border-[var(--cyan)] focus-visible:shadow-[0_0_0_2px_rgba(98,232,255,.1)] disabled:opacity-60"
        value={binding && selected && !value ? selected.name : value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value, null); setActive(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
          }
          if (event.key === "Enter" && expanded && options[activeOption]) {
            event.preventDefault();
            choose(options[activeOption]);
          }
        }}
      />
      {expanded ? (
        <div className="absolute top-[64px] left-0 z-40 w-full min-w-[180px] max-h-[240px] overflow-y-auto border border-[var(--line)] bg-[var(--background)] shadow-xl" id={`${id}-options`} role="listbox" aria-label={`${label} references`} aria-busy={pending}>
          {options.map((candidate, index) => (
            <button
              key={candidate.binding.id}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeOption}
              tabIndex={-1}
              className={`block w-full cursor-pointer border-0 border-b border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink)] ${index === activeOption ? "bg-[rgba(98,232,255,.12)]" : "bg-transparent hover:bg-[rgba(98,232,255,.06)]"}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(candidate)}
            >
              <span className="block">{candidate.name}</span>
              <span className="block text-[9px] text-[var(--muted)]">{candidate.publication}</span>
            </button>
          ))}
          {!options.length ? <p className="m-0 p-3 text-[10px] text-[var(--muted)]">{pending ? "Looking up references..." : error ? kind === "creature_trait" ? "Lookup unavailable; enter custom traits in the traits field." : "Lookup unavailable; custom text is still available." : kind === "creature_trait" ? "No matches. Enter a custom trait in the traits field." : "No matches. Keep your custom text."}</p> : null}
        </div>
      ) : null}
      <div id={`${id}-status`} className="text-[9px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]" aria-live="polite">
        {binding ? (
          <>
            <span>{selected ? `${selected.name} selected · ${selected.coverage === "available" ? kind === "class" ? "AI-authored class context" : "User-entered context available" : "No library text entered"}` : pending ? "Checking selected reference..." : "Selected reference unavailable."}</span>
            <button className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-[var(--cyan)] underline focus-visible:outline focus-visible:outline-[var(--cyan)]" type="button" disabled={disabled} onClick={() => onChange(value, null)}>Use custom text</button>
          </>
        ) : <span>{kind === "creature_trait" ? "Select a result to add a trait." : "Enter custom text or select a reference."}</span>}
        {selected ? <a className="ml-2 text-[var(--cyan)] underline" href={selected.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
        {error ? <div role="alert">{error} <button className="cursor-pointer border-0 bg-transparent p-0 text-[var(--cyan)] underline" type="button" disabled={disabled} onClick={() => setRetry((current) => current + 1)}>Retry</button></div> : null}
      </div>
    </div>
  );
}
