"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Save } from "lucide-react";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { panelClassName, recordActionButtonClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { SystemLibraryEntry } from "@/lib/references/system-library";
import { systemReferenceSaveSchema, type SystemReferenceContent } from "@/lib/validation/system-reference";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function SystemLibraryEditor({ entry, editable, campaignId, contentVisible }: {
  entry: SystemLibraryEntry; editable: boolean; campaignId?: string; contentVisible: boolean;
}) {
  const [content, setContent] = useState<SystemReferenceContent>({ appearance: entry.appearance, lore: entry.lore, traitContext: entry.trait_context, sourceNotes: entry.source_notes });
  const [revision, setRevision] = useState(entry.revision);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { setDirty, clearDirty } = useDirtyForm();
  const clearDirtyOnUnmount = useRef(clearDirty);
  useEffect(() => () => clearDirtyOnUnmount.current("system-reference"), []);
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientHydrationSnapshot, getServerHydrationSnapshot);
  const fields: Array<{ key: keyof SystemReferenceContent; label: string; max: number }> = [
    ...(entry.kind === "ancestry" ? [{ key: "appearance" as const, label: "Appearance", max: 4000 }, { key: "lore" as const, label: "Additional lore", max: 8000 }] : [{ key: "traitContext" as const, label: "Trait context", max: 4000 }]),
    { key: "sourceNotes", label: "Source / attribution notes", max: 2000 },
  ];
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    const parsed = systemReferenceSaveSchema.safeParse({ ...content, expectedRevision: revision });
    if (!parsed.success) { setError("Content exceeds its field limits."); return; }
    setPending(true);
    try {
      if (!campaignId) throw new Error("Choose a campaign before editing its System library.");
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/system-references/${encodeURIComponent(entry.reference_id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok || !Number.isInteger(result.revision)) throw new Error(result.error ?? "Reference could not be saved.");
      setRevision(result.revision); clearDirty("system-reference"); setMessage(`Saved revision ${result.revision}. This campaign uses this text for its next generation.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Reference could not be saved."); }
    finally { setPending(false); }
  }
  return <form className={`${panelClassName} grid min-w-0 gap-5 p-[18px_21px_21px] max-[760px]:px-4`} onSubmit={save}>
    <div className="grid gap-2 border-b border-[var(--line)] pb-4">
      <p className={`${eyebrowClassName} !mb-0`}>CAMPAIGN REFERENCE // {revision ? `REVISION ${revision}` : "NO CONTENT ENTERED"}</p>
      <p className="m-0 text-[11px] text-[var(--muted)]">User-entered System library content · {editable ? "Library editor" : "Read-only"}</p>
      <p className="m-0 max-w-3xl text-[10px] leading-relaxed text-[var(--muted)]">Shared with this campaign&apos;s members, not other campaigns. Do not include campaign secrets. Enter only text you have permission to use. Enabled sections are sent to the campaign&apos;s AI provider; source notes are not.</p>
    </div>
    {!editable ? <p className="m-0 text-[11px] text-[var(--muted)]">{campaignId ? "Ask this campaign's owner to grant you editing access." : "Choose a campaign to view its authored text or edit this entry. Campaign content is not shared across campaigns."}</p> : null}
    {fields.map((field) => <section className="grid min-w-0 gap-3" key={field.key}>
      {editable ? <>
        <label className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] tracking-[.08em] text-[var(--cyan)]" htmlFor={`system-${field.key}`}>{field.label}<span className="text-[var(--dim)]">{content[field.key].length}/{field.max}</span></label>
        <textarea id={`system-${field.key}`} defaultValue={content[field.key]} maxLength={field.max} disabled={pending || !hydrated} rows={field.key === "sourceNotes" ? 3 : 7}
          className="min-w-0 w-full resize-y border border-[var(--line)] bg-[var(--background)] p-3 text-[11px] leading-relaxed text-[var(--ink)] focus-visible:outline focus-visible:outline-[var(--cyan)] disabled:opacity-60"
          onChange={(event) => { const value = event.currentTarget.value; setContent((current) => ({ ...current, [field.key]: value })); setDirty("system-reference"); setMessage(""); }} />
      </> : <h2 className="m-0 text-[13px] text-[var(--ink)]">{field.label}</h2>}
      {contentVisible && content[field.key].trim() ? <MarkdownContent source={content[field.key]} allowEntityLinks={false} className="[overflow-wrap:anywhere]" />
        : <p className="m-0 text-[10px] text-[var(--dim)]">{!campaignId ? "Select a campaign to view its authored content." : !contentVisible
          ? "Campaign membership is required to view authored content."
          : `No ${field.label.toLowerCase()} entered in this campaign. No AI-written fallback.`}</p>}
    </section>)}
    {error ? <p role="alert" className="text-sm text-[var(--pink)]">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-[var(--green)]">{message}</p> : null}
    {editable ? <><p className="m-0 border-t border-[var(--line)] pt-4 text-[10px] leading-relaxed text-[var(--muted)]">Combined generation context is limited to 4,000 characters; image prompts have a smaller total budget. Keep guidance concise.</p>
      {!hydrated ? <p role="status" className="m-0 text-xs text-[var(--muted)]">Preparing editor...</p> : null}
      <button type="submit" disabled={pending || !hydrated} className={`${recordActionButtonClassName} justify-self-end !border-[var(--cyan)] !bg-[var(--cyan)] !text-[#061017] focus-visible:outline focus-visible:outline-[var(--cyan)]`}><Save size={14} />{pending ? "SAVING..." : hydrated ? "SAVE REVISION" : "PREPARING..."}</button></> : null}
  </form>;
}
