"use client";

import { useEffect, useState } from "react";
import type { ReferenceAvailability, ReferenceStatus } from "@/lib/references/types";
import type { LibrarySelection } from "@/lib/references/system-library";
import { referenceContextPreviewSchema } from "@/lib/validation/reference";
import { campaignLibraryPath } from "@/lib/campaign/routes";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";

export default function ReferenceSources({ sources, campaignId, purpose = "text", currentSelections, characterId, compareWithDraft = true }: {
  sources: ReferenceStatus[]; campaignId?: string | null; purpose?: "text" | "image";
  currentSelections?: LibrarySelection[]; characterId?: string; compareWithDraft?: boolean;
}) {
  const selections = currentSelections ?? sources.map((source) => ({ kind: source.kind, binding: { id: source.id, catalogVersion: source.catalogVersion } }));
  const key = JSON.stringify({ campaignId, purpose, characterId, selections: selections.map(({ kind, binding }) => ({ kind, binding: binding ?? null })) });
  const [preview, setPreview] = useState<{ key: string; sources: ReferenceStatus[]; availability: ReferenceAvailability[]; characters: number; error?: string } | null>(null);
  useEffect(() => {
    if (!campaignId) return;
    const controller = new AbortController();
    let sequence = 0;
    const check = async () => {
      const request = ++sequence;
      try {
        const parsedKey = JSON.parse(key);
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/references/context`, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ purpose: parsedKey.purpose, selections: parsedKey.selections, ...(characterId ? { characterId } : {}) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Current System context could not be checked.");
        const current = referenceContextPreviewSchema.parse(result);
        if (!controller.signal.aborted && request === sequence) setPreview({ key, sources: current.sources, availability: current.availability, characters: current.promptCharacters });
      } catch (error) {
        if (!controller.signal.aborted && request === sequence) setPreview({ key, sources: [], availability: [], characters: 0, error: error instanceof Error ? error.message : "Current System context could not be checked." });
      }
    };
    void check();
    window.addEventListener("focus", check);
    return () => { controller.abort(); window.removeEventListener("focus", check); };
  }, [campaignId, characterId, key]);
  const fingerprint = (values: ReferenceStatus[]) => JSON.stringify(values.filter((source) => source.coverage === "available").map((source) => `${source.id}:${source.catalogVersion}:${source.contextHash}`).sort());
  const current = preview?.key === key ? preview : null;
  const changed = compareWithDraft && current && !current.error && fingerprint(sources) !== fingerprint(current.sources);
  return (
    <div className="min-w-0 text-[9px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]" data-reference-sources="true">
      {compareWithDraft && !sources.length ? "No reference text was included in this draft." : sources.map((source) => (
        <p className="m-0" key={`${source.kind}:${source.id}`}>
          <a href={source.sourceUrl} className="text-[var(--cyan)] underline" target="_blank" rel="noreferrer">{source.name}</a>
          {" · "}{source.coverage === "available" ? source.origin === "user-entered" ? `User-entered library revision ${source.revision}` : "Legacy AI-authored catalog context" : "No reference text entered"}
          {" · "}{source.catalogVersion}
          {source.origin === "user-entered" && campaignId ? <>{" · "}<CampaignRouteLink className="text-[var(--cyan)] underline" href={campaignLibraryPath(campaignId, source.kind === "ancestry" ? "ancestries" : "creature-traits", source.id)}>Library content</CampaignRouteLink></> : null}
        </p>
      ))}
      {campaignId ? <p className="m-0" aria-live="polite">{current ? current.error
        ? <span className="text-[var(--amber)]">Context check: {current.error}</span>
        : `Next generation: ${current.characters}/4,000 reference characters.`
        : "Checking current System context..."}</p> : null}
      {current && !current.error ? <ul className="m-0 list-none p-0">{current.availability.length ? current.availability.map((entry, index) => <li key={`${entry.id ?? entry.kind}:${index}`}>
        {entry.name ?? (entry.kind === "ancestry" ? "Ancestry" : entry.kind === "class" ? "Class" : "Creature trait")}: {entry.state === "unbound" ? "No reference selected."
          : entry.state === "disabled" ? "Context not enabled for this generation."
          : entry.state === "empty" ? "Selected entry has no applicable text."
          : "Selected text is available for the next generation."}
      </li>) : <li>No references selected.</li>}</ul> : null}
      {changed ? <p role="status" className="m-0 text-[var(--amber)]">The selected references, library text, or campaign settings have changed since this draft. Review it before applying; its recorded sources remain unchanged.</p> : null}
    </div>
  );
}
