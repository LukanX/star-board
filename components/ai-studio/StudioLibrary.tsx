"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, ImageIcon, MapIcon, Share2, Trash2, Wand2 } from "lucide-react";
import VisualAsset from "@/components/ui/VisualAsset";
import SubjectPicker from "./SubjectPicker";
import FoundryExport from "./FoundryExport";
import { studioBadge, studioButton, studioGhostButton, studioInput, studioLabel, studioMicro, studioPanel, studioToggle } from "./studioStyles";
import type { StudioAsset, StudioAssetAction } from "@/lib/campaign/studio-server";
import type { StudioSubjectOption } from "@/lib/ai/studio-context";
import type { StudioLibraryFilter } from "@/lib/validation/studio";

const filterLabels: Record<StudioLibraryFilter, string> = { all: "All", scene: "Art", battlemap: "Battlemaps", shared: "Shared" };
const emptyMessages: Record<StudioLibraryFilter, string> = {
  all: "No saved art yet. Generate a draft, review it, then save it to this library.",
  scene: "No saved art scenes yet.",
  battlemap: "No saved battlemaps yet.",
  shared: "Nothing is shared with players yet. Share an entry to add it to the player Art gallery.",
};

function AssetCard({ campaignId, asset, onChange, onReuse, onEdit }: {
  campaignId: string; asset: StudioAsset; onChange: () => void; onReuse: (asset: StudioAsset) => void;
  onEdit: (asset: StudioAsset) => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [caption, setCaption] = useState(asset.caption);
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [target, setTarget] = useState<StudioSubjectOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detailsId = `studio-asset-${asset.id}`;
  async function act(input: StudioAssetAction) {
    if (busy) return;
    if (input.action === "share" && !window.confirm("Share this image, title and caption with all campaign members? Review the image itself for spoilers. Prompts and source details remain private.")) return;
    if (input.action === "assign" && !window.confirm(`Replace ${target?.name ?? "this subject"}'s primary artwork? This does not publish the library image or reveal a hidden enemy.`)) return;
    if (input.action === "delete" && !window.confirm("Delete this library entry and unshare it? Assigned copies remain. Existing downloads and signed links cannot be immediately revoked.")) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/studio/${asset.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Artwork action failed.");
      setMessage(input.action === "assign" ? "Primary art replaced. The entity copy keeps private provenance independently of the library." : "Artwork updated.");
      setAssigning(false); setTarget(null); onChange();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Artwork action failed."); }
    finally { setBusy(false); }
  }
  const KindIcon = asset.kind === "battlemap" ? MapIcon : ImageIcon;
  return <article className="flex min-w-0 flex-col border border-[var(--line)] bg-[var(--panel)]" aria-label={asset.title}>
    <VisualAsset src={asset.signedUrl} label={asset.title} downloadName={asset.title} className="aspect-square w-full border-b border-[var(--line)] bg-contain" />
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
      <div className="min-w-0">
        <h3 className="m-0 break-words text-sm font-semibold text-[var(--ink)]">{asset.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className={`${studioBadge} border-[var(--line)] text-[var(--muted)]`}><KindIcon aria-hidden="true" size={10} />{asset.kind === "battlemap" ? "BATTLEMAP" : "ART"}</span>
          <span className={`${studioBadge} ${asset.shared ? "border-[var(--green)]/60 text-[var(--green)]" : "border-[var(--line)] text-[var(--dim)]"}`}>{asset.shared ? <Eye aria-hidden="true" size={10} /> : <EyeOff aria-hidden="true" size={10} />}{asset.shared ? "SHARED" : "GM ONLY"}</span>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        {asset.shared
          ? <button type="button" className={studioGhostButton} disabled={busy} onClick={() => void act({ action: "unshare" })}><EyeOff aria-hidden="true" size={12} />Unshare</button>
          : <button type="button" className={studioGhostButton} disabled={busy || !title.trim()} onClick={() => void act({ action: "share", title, caption })}><Share2 aria-hidden="true" size={12} />Share with players</button>}
        <button type="button" className={studioGhostButton} disabled={busy} aria-label="Delete library entry" onClick={() => void act({ action: "delete" })}><Trash2 aria-hidden="true" size={12} />Delete</button>
        <button type="button" className={`${studioGhostButton} ml-auto`} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((value) => !value)}>Details{open ? <ChevronUp aria-hidden="true" size={12} /> : <ChevronDown aria-hidden="true" size={12} />}</button>
      </div>
      <button type="button" className={studioGhostButton} disabled={busy} onClick={() => onEdit(asset)}><Wand2 aria-hidden="true" size={12} />Edit image with AI</button>
      {asset.kind === "battlemap" && <FoundryExport src={asset.signedUrl} name={asset.title} disabled={busy} />}
      {busy && <p role="status" className={studioLabel}>Updating artwork...</p>}
      {message && <p role="status" className="m-0 text-xs text-[var(--green)]">{message}</p>}
      {error && <p role="alert" className="m-0 break-words text-xs text-[var(--pink)]">{error}</p>}
      {open && <div id={detailsId} className="space-y-3 border-t border-[var(--line)] pt-3">
        <label className={studioLabel}>Library title<input className={studioInput} value={title} maxLength={160} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className={studioLabel}>Library caption<textarea className={studioInput} rows={3} value={caption} maxLength={2000} disabled={busy} onChange={(event) => setCaption(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={studioButton} disabled={busy || !title.trim()} onClick={() => void act({ action: "edit", title, caption })}>Save display text</button>
          {asset.shared && <button type="button" className={studioButton} disabled={busy || !title.trim()} onClick={() => void act({ action: "share", title, caption })}>Update shared display</button>}
          <button type="button" className={studioButton} disabled={busy} onClick={() => onReuse(asset)}>Reuse composition</button>
          <button type="button" className={studioButton} disabled={busy} aria-expanded={assigning} onClick={() => setAssigning((value) => !value)}>Assign primary art</button>
        </div>
        {assigning && <div className="space-y-3 border-t border-[var(--line)] pt-3">
          <p className={studioLabel}>Choose one destination. Its normal visibility rules apply to the assigned copy.</p>
          <SubjectPicker campaignId={campaignId} disabled={busy} onSelect={setTarget} />
          {target && <><p className="m-0 break-words text-sm">Replace primary art for {target.name}?</p><button type="button" className={studioButton} disabled={busy} onClick={() => void act({ action: "assign", kind: target.kind, id: target.id, expectedUpdatedAt: target.updated_at })}>Confirm primary art replacement</button></>}
        </div>}
        <details className="min-w-0">
          <summary className="cursor-pointer text-xs text-[var(--muted)]">Private generation provenance</summary>
          <p className={`${studioMicro} mt-2`}>{asset.model} · {asset.provider} · {asset.aspect_ratio}</p>
          <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--muted)]">{asset.prompt}</p>
          <p className={studioLabel}>Sources: {asset.manifest.sources.map((source) => source.name).join(", ") || "Freeform"}</p>
        </details>
      </div>}
    </div>
  </article>;
}

export default function StudioLibrary({ campaignId, assets, filter, loading, onFilter, onChange, onReuse, onEdit }: {
  campaignId: string; assets: StudioAsset[]; filter: StudioLibraryFilter; loading: boolean;
  onFilter: (filter: StudioLibraryFilter) => void; onChange: () => void; onReuse: (asset: StudioAsset) => void;
  onEdit: (asset: StudioAsset) => void;
}) {
  return <section aria-label="Private campaign art library" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="m-0 text-lg">Campaign art library</h2>
        <p className={`${studioLabel} mt-1 max-w-2xl`}>Saved art is private until shared. Library text edits don&apos;t change a published caption until you choose Update shared display. Previews expire within ten minutes.</p>
      </div>
      <div role="group" aria-label="Filter library" className="flex flex-wrap gap-1">
        {(Object.keys(filterLabels) as StudioLibraryFilter[]).map((value) =>
          <button key={value} type="button" className={studioToggle} aria-pressed={filter === value} disabled={loading} onClick={() => onFilter(value)}>{filterLabels[value]}</button>)}
      </div>
    </div>
    {!assets.length && <div className={`${studioPanel} text-sm text-[var(--muted)]`}>{loading ? "Loading library..." : emptyMessages[filter]}</div>}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <AssetCard key={asset.id} campaignId={campaignId} asset={asset} onChange={onChange} onReuse={onReuse} onEdit={onEdit} />)}</div>
  </section>;
}
