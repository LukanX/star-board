"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import PageLayout from "@/components/ui/PageLayout";
import StudioComposer, { type StudioComposerHandle } from "./StudioComposer";
import StudioLibrary from "./StudioLibrary";
import { studioGhostButton, studioToggle } from "./studioStyles";
import type { StudioAsset } from "@/lib/campaign/studio-server";
import type { StudioLibraryFilter } from "@/lib/validation/studio";

export default function CampaignStudio({ campaignId, userId, initialAssets }: { campaignId: string; userId: string; initialAssets: StudioAsset[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<StudioLibraryFilter>("all");
  const [view, setView] = useState<"create" | "library">("create");
  const composer = useRef<StudioComposerHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initialLibraryPosition = { offset: 0, filter: "all" as StudioLibraryFilter };
  const libraryPosition = useRef(initialLibraryPosition);
  const confirmedLibraryPosition = useRef(initialLibraryPosition);
  const loadRequestId = useRef(0);
  async function load(nextOffset?: number, nextFilter?: StudioLibraryFilter) {
    const position = {
      offset: nextOffset ?? libraryPosition.current.offset,
      filter: nextFilter ?? libraryPosition.current.filter,
    };
    libraryPosition.current = position;
    const requestId = ++loadRequestId.current;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ offset: String(position.offset), filter: position.filter });
      const response = await fetch(`/api/campaigns/${campaignId}/studio?${query}`, { cache: "no-store" });
      const result = await response.json() as { assets?: StudioAsset[]; error?: string };
      if (requestId !== loadRequestId.current) return;
      if (!response.ok || !result.assets) throw new Error(result.error ?? "Library could not be loaded.");
      confirmedLibraryPosition.current = position;
      setAssets(result.assets); setOffset(position.offset); setFilter(position.filter);
    } catch (failure) {
      if (requestId === loadRequestId.current) {
        libraryPosition.current = confirmedLibraryPosition.current;
        setError(failure instanceof Error ? failure.message : "Library could not be loaded.");
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }
  async function openLibraryAfterSave() {
    setFilter("all"); setOffset(0);
    await load(0, "all");
    setView("library");
  }
  return <PageLayout eyebrow="CREATIVE OPERATIONS / GM ONLY" title="AI Studio" description="Compose campaign scenes and tactical map images. Review before saving; sharing and primary-art replacement are always separate actions.">
    <div className="grid min-w-0 gap-8">
      <div className="flex flex-wrap gap-2" aria-label="Studio views">
        <button type="button" className={studioToggle} aria-pressed={view === "create"} onClick={() => setView("create")}>Create</button>
        <button type="button" className={studioToggle} aria-pressed={view === "library"} onClick={() => {
          if (view === "library") return;
          void composer.current?.leave().then((accepted) => { if (accepted) setView("library"); });
        }}>Library</button>
      </div>
      <div hidden={view !== "create"}><StudioComposer key={`${campaignId}:${userId}`} ref={composer} campaignId={campaignId} userId={userId} onSaved={() => void openLibraryAfterSave()} /></div>
      {error && <p role="alert" className="text-sm text-[var(--pink)]">{error}</p>}
      <div hidden={view !== "library"} className="min-w-0 space-y-4">
      <StudioLibrary campaignId={campaignId} assets={assets} filter={filter} loading={loading} onFilter={(value) => void load(0, value)} onChange={() => void load()}
        onEdit={(asset) => { void composer.current?.editSaved(asset).then((accepted) => { if (accepted) { setView("create"); window.scrollTo({ top: 0, behavior: "smooth" }); } }); }}
        onReuse={(asset) => { void composer.current?.reuse(asset).then((accepted) => { if (accepted) { setView("create"); window.scrollTo({ top: 0, behavior: "smooth" }); } }); }}
 />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={studioGhostButton} disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - 24))}><ChevronLeft aria-hidden="true" size={12} />Previous artwork</button>
        <button type="button" className={studioGhostButton} disabled={loading || assets.length < 24} onClick={() => void load(offset + 24)}>Next artwork<ChevronRight aria-hidden="true" size={12} /></button>
        <button type="button" className={studioGhostButton} disabled={loading} onClick={() => void load()}><RefreshCw aria-hidden="true" size={12} />Refresh library previews</button>
      </div>
      </div>
    </div>
  </PageLayout>;
}
