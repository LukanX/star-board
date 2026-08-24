import { ArrowUpRight, Map } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { FactionEmblem } from "@/components/factions/FactionCard";
import { archivePreviewArtworkClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function FactionPreview({ campaignId, faction, places }: { campaignId: string; faction: FactionRecord; places: ApiPlace[] }) {
  const artUrl = getAttachedArtUrl(faction.art_url, faction.art_path);

  return <div data-faction-preview="true" className="grid gap-[17px]"><div data-archive-preview-heading="true" tabIndex={-1} className="min-w-0 outline-0"><p className={eyebrowClassName}>PUBLIC FACTION PREVIEW</p><h2 className="m-0 text-[22px] [overflow-wrap:anywhere]">{faction.name}</h2><p className="mt-[8px] m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.1em]">{faction.status.toUpperCase()}</p></div><div data-faction-preview-art="true" className={archivePreviewArtworkClassName}><FactionEmblem faction={faction} iconSize={72} size="fill" />{artUrl ? <span className="sr-only">Artwork attached</span> : null}</div><div className="grid gap-[14px]"><p className="m-0 flex items-center gap-[6px] text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] leading-[1.5] flex-wrap [overflow-wrap:anywhere]"><Map size={13} /> {getPlaceBreadcrumb(places, faction.place_id) || "NO PRIMARY PLACE"}</p><div className="grid gap-[7px]"><p className={`${eyebrowClassName} !mb-0`}>PUBLIC BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{faction.description || "No public description recorded yet."}</p></div><CampaignRouteLink className="h-[37px] inline-flex w-fit items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(98,232,255,.08)] px-[14px] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] hover:border-[var(--cyan)] hover:bg-[rgba(98,232,255,.14)]" href={campaignEntityPath(campaignId, "factions", faction.id)}><ArrowUpRight aria-hidden="true" size={14} /> OPEN FULL RECORD</CampaignRouteLink></div></div>;
}