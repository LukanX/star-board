import { ArrowUpRight, BookOpen, LockKeyhole, Map } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { FactionEmblem } from "@/components/factions/FactionCard";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";
import { archivePreviewArtworkClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { RelatedNpcSummary } from "@/lib/campaign/detail-types";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function FactionPreview({ campaignId, faction, places, memberNpcs = [], isGM = false }: { campaignId: string; faction: FactionRecord; places: ApiPlace[]; memberNpcs?: RelatedNpcSummary[]; isGM?: boolean }) {
  const artUrl = getAttachedArtUrl(faction.art_url, faction.art_path);

  return <div data-faction-preview="true" className="grid gap-[17px]">
    <div data-archive-preview-heading="true" tabIndex={-1} className="flex min-w-0 items-start justify-between gap-[15px] max-[420px]:gap-[8px]">
      <div className="min-w-0">
        <p className={eyebrowClassName}>PUBLIC FACTION PREVIEW</p>
        <h2 className="m-0 text-[22px] [overflow-wrap:anywhere]">{faction.name}</h2>
        <p className="mt-[8px] m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.1em]">{faction.status.toUpperCase()}</p>
      </div>
      <CampaignRouteLink data-archive-preview-action="true" className="ml-auto inline-flex h-[37px] shrink-0 items-center justify-center gap-2 whitespace-nowrap border border-[var(--line)] bg-[rgba(98,232,255,.08)] px-[14px] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] hover:border-[var(--cyan)] hover:bg-[rgba(98,232,255,.14)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2" href={campaignEntityPath(campaignId, "factions", faction.id)}><ArrowUpRight aria-hidden="true" size={14} /> OPEN FULL RECORD</CampaignRouteLink>
    </div>
    <div data-faction-preview-art="true" className={archivePreviewArtworkClassName}><FactionEmblem faction={faction} iconSize={72} size="fill" />{artUrl ? <span className="sr-only">Artwork attached</span> : null}</div>
    <div className="grid gap-[14px]">
      <p className="m-0 flex flex-wrap items-center gap-[6px] text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] leading-[1.5] [overflow-wrap:anywhere]"><Map size={13} /> {getPlaceBreadcrumb(places, faction.place_id) || "NO PRIMARY PLACE"}</p>
      <div className="grid gap-[7px]"><p className={`${eyebrowClassName} !mb-0`}>PUBLIC BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{faction.description || "No public description recorded yet."}</p></div>
      <MarkdownPreview data-faction-preview-notes="true"><MarkdownPreviewToolbar><BookOpen size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span></MarkdownPreviewToolbar><p>{faction.player_notes_markdown || "No player notes recorded yet."}</p></MarkdownPreview>
      {isGM ? <MarkdownPreview data-faction-preview-private="true" className="border-[rgba(255,92,154,.25)]"><MarkdownPreviewToolbar className="text-[var(--pink)]"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></MarkdownPreviewToolbar><p>{faction.gm_notes_markdown || "No private notes recorded yet."}</p></MarkdownPreview> : null}
      <ArchiveRelatedList eyebrow="FACTION ROSTER" title={`${memberNpcs.length} NPC${memberNpcs.length === 1 ? "" : "S"}`} emptyMessage="No NPCs are assigned to this faction." items={memberNpcs.map((npc) => ({ id: npc.id, href: campaignEntityPath(campaignId, "npcs", npc.id), label: npc.name, meta: [npc.species, npc.role].filter(Boolean).join(" // ") }))} />
    </div>
  </div>;
}