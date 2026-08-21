import Link from "next/link";
import { Map, Network } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";

function FactionCardArt({ faction }: { faction: FactionRecord }) {
  const src = getAttachedArtUrl(faction.art_url, faction.art_path);
  return <div aria-label={`${faction.name} emblem`} className={`faction-emblem ${src ? "has-art" : "no-art"}`} role="img" style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Network size={24} />}</div>;
}

export default function FactionCard({ campaignId, faction, places }: { campaignId: string; faction: FactionRecord; places: ApiPlace[] }) {
  return <Link aria-label={`Open public file for ${faction.name}`} className={`faction-card faction-${faction.color}`} href={campaignEntityPath(campaignId, "factions", faction.id)}><div className="faction-top"><FactionCardArt faction={faction} /><StatusPill color={faction.color}>{faction.status.toUpperCase()}</StatusPill></div><h3>{faction.name}</h3><p>{faction.description || "No public description recorded."}</p><div className="faction-footer"><span><strong><Map size={13} /> CAMPAIGN</strong><small>{getPlaceBreadcrumb(places, faction.place_id) || "MISSION CONTEXT"}</small></span></div></Link>;
}