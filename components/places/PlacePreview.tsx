import { ArrowUpRight, FileText, LockKeyhole, Map } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import { PlaceArt } from "@/components/places/PlaceCard";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function PlacePreview({ campaignId, place, places, isGM }: { campaignId: string; place: ApiPlace; places: ApiPlace[]; isGM: boolean }) {
  return <div data-place-preview="true" className="grid gap-[17px]">
    <div data-archive-preview-heading="true" tabIndex={-1} className="flex min-w-0 items-start justify-between gap-[15px] max-[420px]:gap-[8px]">
      <div className="min-w-0">
        <p className={eyebrowClassName}>{place.kind.toUpperCase()} PREVIEW</p>
        <h2 className="m-0 text-[22px] [overflow-wrap:anywhere]">{place.name}</h2>
        <p className="mt-[8px] flex flex-wrap items-center gap-[6px] m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] leading-[1.5] [overflow-wrap:anywhere]"><Map size={13} /> {getPlaceBreadcrumb(places, place.id) || "ROOT LOCATION"}</p>
      </div>
      <CampaignRouteLink data-archive-preview-action="true" className="ml-auto inline-flex h-[37px] shrink-0 items-center justify-center gap-2 whitespace-nowrap border border-[var(--line)] bg-[rgba(98,232,255,.08)] px-[14px] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] hover:border-[var(--cyan)] hover:bg-[rgba(98,232,255,.14)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2" href={campaignEntityPath(campaignId, "places", place.id)}><ArrowUpRight aria-hidden="true" size={14} /> OPEN FULL RECORD</CampaignRouteLink>
    </div>
    <PlaceArt place={place} variant="detail" />
    <div data-place-preview-copy="true" className="grid gap-[14px]">
      <div className="grid gap-[7px]"><p className={`${eyebrowClassName} !mb-0`}>PUBLIC BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{place.description || "No public description recorded yet."}</p></div>
      <MarkdownPreview data-place-preview-notes="true"><MarkdownPreviewToolbar><FileText size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span></MarkdownPreviewToolbar><p>{place.player_notes_markdown || "No player notes recorded yet."}</p></MarkdownPreview>
      {isGM ? <MarkdownPreview data-place-preview-private="true" className="border-[rgba(255,92,154,.25)]"><MarkdownPreviewToolbar className="text-[var(--pink)]"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></MarkdownPreviewToolbar><p>{place.gm_notes_markdown || "No private notes recorded yet."}</p></MarkdownPreview> : null}
    </div>
  </div>;
}