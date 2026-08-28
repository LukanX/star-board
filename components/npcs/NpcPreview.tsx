import { ArrowUpRight, BookOpen, LockKeyhole, Map, Network, UserRound } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { archivePreviewArtworkClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { RelatedFactionSummary } from "@/lib/campaign/detail-types";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace, NpcRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function NpcPreview({ campaignId, npc, faction, places, isGM }: { campaignId: string; npc: NpcRecord; faction?: RelatedFactionSummary | null; places: ApiPlace[]; isGM: boolean }) {
  const artUrl = getAttachedArtUrl(npc.art_url, npc.art_path);

  return <div data-npc-preview="true" className="grid gap-[17px]">
    <div data-archive-preview-heading="true" tabIndex={-1} className="flex min-w-0 items-start justify-between gap-[15px] max-[420px]:gap-[8px]">
      <div className="min-w-0">
        <p className={eyebrowClassName}>PUBLIC CONTACT PREVIEW</p>
        <h2 className="m-0 text-[22px] [overflow-wrap:anywhere]">{npc.name}</h2>
        <p className="mt-[8px] m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.1em]">{`${npc.species || "Unclassified"} // ${npc.role || "CONTACT"}`}</p>
      </div>
      <CampaignRouteLink data-archive-preview-action="true" className="ml-auto inline-flex h-[37px] shrink-0 items-center justify-center gap-2 whitespace-nowrap border border-[var(--line)] bg-[rgba(98,232,255,.08)] px-[14px] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] hover:border-[var(--cyan)] hover:bg-[rgba(98,232,255,.14)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2" href={campaignEntityPath(campaignId, "npcs", npc.id)}><ArrowUpRight aria-hidden="true" size={14} /> OPEN FULL RECORD</CampaignRouteLink>
    </div>
    <div data-npc-preview-art="true" className={`${archivePreviewArtworkClassName} border border-[rgba(98,232,255,.28)] bg-[#0a1118]`}><RecordPortrait src={artUrl} label={`${npc.name} portrait`} className="w-full h-full" fallback={<UserRound size={19} />} /> </div>
    <div data-npc-preview-copy="true" className="grid gap-[14px]">
      {faction ? <CampaignRouteLink data-npc-preview-faction="true" className="m-0 flex w-fit max-w-full items-center gap-[6px] text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] [overflow-wrap:anywhere] hover:text-[var(--ink)]" href={campaignEntityPath(campaignId, "factions", faction.id)}><Network size={13} /> FACTION // {faction.name}</CampaignRouteLink> : null}
      <p className="m-0 flex flex-wrap items-center gap-[6px] text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] leading-[1.5] [overflow-wrap:anywhere]"><Map size={13} /> {getPlaceBreadcrumb(places, npc.place_id) || "NO PRIMARY PLACE"}</p>
      <div className="grid gap-[7px]"><p className={`${eyebrowClassName} !mb-0`}>PUBLIC BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{npc.description || "No public description recorded yet."}</p></div>
      <MarkdownPreview data-npc-preview-notes="true"><MarkdownPreviewToolbar><BookOpen size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span></MarkdownPreviewToolbar><p>{npc.player_notes_markdown || "No player notes recorded yet."}</p></MarkdownPreview>
      {isGM ? <MarkdownPreview data-npc-preview-private="true" className="border-[rgba(255,92,154,.25)]"><MarkdownPreviewToolbar className="text-[var(--pink)]"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></MarkdownPreviewToolbar><p>{npc.gm_notes_markdown || "No private notes recorded yet."}</p></MarkdownPreview> : null}
    </div>
  </div>;
}