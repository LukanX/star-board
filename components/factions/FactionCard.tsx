import Link from "next/link";
import { Map, Network } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";

export function FactionEmblem({ faction, iconSize }: { faction: FactionRecord; iconSize: number }) {
  const src = getAttachedArtUrl(faction.art_url, faction.art_path);
  const artClasses = src ? "bg-contain" : "bg-[repeating-linear-gradient(135deg,rgba(98,232,255,.08)_0_1px,transparent_1px_9px)]";

  return <div aria-label={`${faction.name} emblem`} className={`w-[64px] h-[64px] flex-[0_0_64px] grid place-items-center overflow-hidden border border-current bg-[#0a1118] bg-center bg-no-repeat text-current ${artClasses}`} role="img" style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Network className="opacity-75" size={iconSize} />}</div>;
}

export default function FactionCard({ campaignId, faction, places }: { campaignId: string; faction: FactionRecord; places: ApiPlace[] }) {
  return <Link aria-label={`Open public file for ${faction.name}`} className={`faction-${faction.color} block relative min-h-[202px] overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-[18px] after:absolute after:-right-8 after:-bottom-[34px] after:h-[115px] after:w-[115px] after:rotate-45 after:border after:border-current after:opacity-[.14] after:content-['']`} href={campaignEntityPath(campaignId, "factions", faction.id)}><div data-faction-top="true" className="flex items-start justify-between"><FactionEmblem faction={faction} iconSize={24} /><StatusPill color={faction.color}>{faction.status.toUpperCase()}</StatusPill></div><h3 className="mt-[28px] mb-[6px] max-w-[190px] text-[15px] text-[var(--ink)]">{faction.name}</h3><p className="m-0 text-[10px] text-[var(--muted)]">{faction.description || "No public description recorded."}</p><div data-faction-footer="true" className="mt-[19px] flex items-end justify-between"><span><strong className="block font-mono text-[13px] font-medium text-current"><Map size={13} /> CAMPAIGN</strong><small className="mt-[3px] block font-mono text-[7px] text-[var(--dim)]">{getPlaceBreadcrumb(places, faction.place_id) || "MISSION CONTEXT"}</small></span></div></Link>;
}