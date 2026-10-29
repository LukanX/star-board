"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { searchCampaignReferences } from "@/lib/references/client";
import type { ReferenceCandidate } from "@/lib/references/types";

type SearchResult = {
  key: string;
  results: ReferenceCandidate[];
  nextOffset: number | null;
  error?: string;
};

function traitValues(value: string) {
  return value.split(",").map((trait) => trait.trim()).filter(Boolean);
}

export default function EnemyTraitsField({ campaignId, label, value, query, disabled, traitsLocked, onChange, onQueryChange, onSelect }: {
  campaignId: string;
  label: string;
  value: string;
  query: string;
  disabled: boolean;
  traitsLocked: boolean;
  onChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSelect: (value: string, candidate: ReferenceCandidate) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const moreKeyRef = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [moreKey, setMoreKey] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const traits = traitValues(value);
  const excluded = traits.join(",");
  const search = query.trim();
  const key = JSON.stringify({ campaignId, search, excluded, retry });
  const tooLong = search.length > 160;
  const atLimit = traits.length >= 32;
  const pending = !tooLong && !atLimit && result?.key !== key;
  const current = result?.key === key ? result : null;
  const options = tooLong || atLimit ? [] : current?.results ?? [];
  const expanded = open && !disabled && !traitsLocked;
  const activeOption = active === null ? null : Math.min(active, Math.max(0, options.length - 1));

  useEffect(() => {
    if (tooLong || atLimit) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind: "creature_trait", q: search, limit: "20", exclude: excluded });
        const data = await searchCampaignReferences(campaignId, params, controller.signal);
        if (data.nextOffset === undefined) throw new Error("The trait lookup response was missing pagination.");
        if (!controller.signal.aborted) setResult({ key, results: data.results, nextOffset: data.nextOffset });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, results: [], nextOffset: null, error: error instanceof Error ? error.message : "Trait lookup failed." });
      }
    }, 180);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [atLimit, campaignId, excluded, key, search, tooLong]);

  async function loadMore() {
    const controller = controllerRef.current;
    if (!current || current.nextOffset === null || !controller || controller.signal.aborted || moreKeyRef.current === key) return;
    moreKeyRef.current = key;
    setMoreKey(key);
    try {
      const params = new URLSearchParams({ kind: "creature_trait", q: search, limit: "20", exclude: excluded, offset: String(current.nextOffset) });
      const data = await searchCampaignReferences(campaignId, params, controller.signal);
      if (data.nextOffset === undefined) throw new Error("The trait lookup response was missing pagination.");
      if (!controller.signal.aborted) setResult((previous) => previous?.key === key ? { key, results: [...previous.results, ...data.results], nextOffset: data.nextOffset ?? null } : previous);
    } catch (error) {
      if (!controller.signal.aborted) setResult((previous) => previous?.key === key ? { ...previous, error: error instanceof Error ? error.message : "Trait lookup failed." } : previous);
    } finally {
      if (moreKeyRef.current === key) moreKeyRef.current = null;
      setMoreKey((previous) => previous === key ? null : previous);
    }
  }

  function addCustom(text: string, remaining = "") {
    const additions = traitValues(text);
    if (!additions.length) { onQueryChange(remaining); return; }
    const next = [...traits];
    for (const trait of additions) {
      if (trait.length > 48) { setNotice("Each trait must be 48 characters or fewer."); return; }
      if (next.some((existing) => existing.toLowerCase() === trait.toLowerCase())) { setNotice(`"${trait}" is already added.`); return; }
      if (next.length >= 32) { setNotice("Maximum of 32 traits selected."); return; }
      next.push(trait);
    }
    setNotice(null);
    onChange(next.join(", "));
    onQueryChange(remaining);
    setActive(null);
  }

  function choose(candidate: ReferenceCandidate) {
    if (traits.length >= 32) { setNotice("Maximum of 32 traits selected."); return; }
    if (candidate.name.length > 48) { setNotice("Each trait must be 48 characters or fewer."); return; }
    setNotice(null);
    onSelect([...traits, candidate.name].join(", "), candidate);
    onQueryChange("");
    setOpen(false);
    setActive(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return <div className="grid min-w-0 content-start gap-2" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      if (query.trim()) addCustom(query);
      setOpen(false);
    }
  }}>
    <div className="relative grid min-w-0 gap-[7px]">
      <label htmlFor={id} className="text-[var(--dim)] font-mono text-[8px] tracking-[.12em]">{label}</label>
      <div className="flex min-h-[42px] min-w-0 flex-wrap items-center gap-1 border border-[rgba(139,151,169,.28)] bg-[#0a1118] p-1 focus-within:border-[var(--cyan)] focus-within:shadow-[0_0_0_2px_rgba(98,232,255,.1)]" onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}>
        {traits.map((trait) => <span key={trait} className="inline-flex max-w-full items-center gap-1 border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink)]">
          <span className="min-w-0 [overflow-wrap:anywhere]">{trait}</span>
          <button type="button" aria-label={`Remove ${trait} trait`} disabled={disabled || traitsLocked} className="shrink-0 cursor-pointer text-[var(--cyan)] focus-visible:outline focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-60" onClick={() => onChange(traits.filter((entry) => entry !== trait).join(", "))}><X size={14} aria-hidden="true" /></button>
        </span>)}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-options`}
          aria-describedby={`${id}-status`}
          aria-activedescendant={expanded && activeOption !== null && options.length ? `${id}-option-${activeOption}` : undefined}
          autoComplete="off"
          maxLength={400}
          placeholder={traits.length ? "Add a trait" : "Search or add a trait"}
          className="min-w-[120px] flex-1 !w-auto !h-[32px] !border-0 !bg-transparent !p-1 text-[var(--ink)] font-mono text-[11px] !outline-none disabled:opacity-60"
          value={query}
          disabled={disabled || traitsLocked}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setNotice(null);
            setActive(null);
            setOpen(true);
            if (text.includes(",")) {
              const lastComma = text.lastIndexOf(",");
              onQueryChange(text);
              addCustom(text.slice(0, lastComma), text.slice(lastComma + 1).trimStart());
            } else onQueryChange(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(null); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) { setOpen(true); setActive(null); return; }
              if (event.key === "ArrowDown" && activeOption === options.length - 1) void loadMore();
              const next = activeOption === null ? 0 : Math.max(0, Math.min(options.length - 1, activeOption + (event.key === "ArrowDown" ? 1 : -1)));
              if (options.length) { setActive(next); document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: "nearest" }); }
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (expanded && activeOption !== null && options[activeOption]) choose(options[activeOption]);
              else if (query.trim()) addCustom(query);
            }
          }}
        />
      </div>
      {expanded ? <div className="absolute left-0 top-full z-40 mt-1 w-full border border-[var(--line)] bg-[var(--background)] shadow-xl">
        <div id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`} aria-busy={pending || moreKey === key} className="max-h-[240px] overflow-y-auto" onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollTop + element.clientHeight >= element.scrollHeight - 24) void loadMore();
        }}>
          {options.map((candidate, index) => <button key={candidate.binding.id} id={`${id}-option-${index}`} type="button" role="option" aria-selected={index === activeOption} tabIndex={-1}
            className={`block w-full cursor-pointer border-0 border-b border-[var(--line)] px-3 py-2 text-left text-[11px] text-[var(--ink)] ${index === activeOption ? "bg-[rgba(98,232,255,.12)]" : "bg-transparent hover:bg-[rgba(98,232,255,.06)]"}`}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(candidate)}>
            <span className="block">{candidate.name}</span><span className="block text-[9px] text-[var(--muted)]">{candidate.publication}</span>
          </button>)}
          {!options.length ? <p className="m-0 p-3 text-[10px] text-[var(--muted)]">{tooLong ? "Search terms must be 160 characters or fewer." : atLimit ? "Maximum of 32 traits selected." : pending ? "Looking up traits..." : current?.error ? "Trait lookup unavailable. Custom text is still available." : "No matching traits. Custom text is still available."}</p> : null}
        </div>
        {!tooLong && !atLimit && current?.nextOffset !== null && current?.nextOffset !== undefined ? <button type="button" className="w-full cursor-pointer px-3 py-2 text-left text-[10px] text-[var(--cyan)] focus-visible:outline focus-visible:outline-[var(--cyan)] disabled:opacity-60" disabled={moreKey === key} onClick={() => void loadMore()}>{moreKey === key ? "Loading..." : "Load more traits"}</button> : null}
        {current?.error ? <div role="alert" className="p-3 text-[10px] text-[var(--muted)]">{current.error} <button type="button" className="cursor-pointer text-[var(--cyan)] underline" onClick={() => current.results.length ? void loadMore() : setRetry((previous) => previous + 1)}>Retry</button></div> : null}
      </div> : null}
    </div>
    <div id={`${id}-status`} aria-live="polite" className="text-[9px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]">
      <span>Type a trait and press Enter or comma, or select a suggestion.</span>
      {notice ? <div role="alert">{notice}</div> : null}
      {!expanded && current?.error ? <div role="alert">{current.error} <button type="button" className="cursor-pointer text-[var(--cyan)] underline" onClick={() => current.results.length ? void loadMore() : setRetry((previous) => previous + 1)}>Retry</button></div> : null}
    </div>
  </div>;
}
