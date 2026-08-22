import Link from "next/link";
import { ArrowLeft, Map } from "lucide-react";
import { FactionEmblem } from "@/components/factions/FactionCard";
import ArtDownloadButton from "@/components/ui/ArtDownloadButton";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { recordDetailClassName, recordDetailMetaClassName, recordMetaClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";

export default function FactionPublicRecord({ campaignId, faction, places }: { campaignId: string; faction: FactionRecord; places: ApiPlace[] }) {
  const artUrl = getAttachedArtUrl(faction.art_url, faction.art_path);

  return <section aria-labelledby="faction-public-record-title" className={`${recordDetailClassName} faction-public-record`}><Link className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]" href={campaignSectionPath(campaignId, "factions")}><ArrowLeft size={14} /> BACK TO FACTIONS</Link><div data-faction-public-top="true" className="flex items-start justify-between"><div className="flex items-start gap-2"><FactionEmblem faction={faction} iconSize={28} />{artUrl ? <ArtDownloadButton className="relative" name={faction.name} src={artUrl} /> : null}</div><div><p className={eyebrowClassName}>PUBLIC FACTION FILE</p><h2 id="faction-public-record-title">{faction.name}</h2><p className={recordDetailMetaClassName}>{faction.status.toUpperCase()}</p></div></div><p>{faction.description || "No public description recorded yet."}</p><p className={recordMetaClassName}><Map size={13} /> {getPlaceBreadcrumb(places, faction.place_id) || "No primary place"}</p></section>;
}