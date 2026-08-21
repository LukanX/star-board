import Link from "next/link";
import { ArrowLeft, Map, Network } from "lucide-react";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";

function FactionPublicArt({ faction }: { faction: FactionRecord }) {
  const src = getAttachedArtUrl(faction.art_url, faction.art_path);
  return <div aria-label={`${faction.name} emblem`} className={`faction-emblem ${src ? "has-art" : "no-art"}`} role="img" style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Network size={28} />}</div>;
}

export default function FactionPublicRecord({ campaignId, faction, places }: { campaignId: string; faction: FactionRecord; places: ApiPlace[] }) {
  return <section aria-labelledby="faction-public-record-title" className="record-detail faction-public-record"><Link className="button button-secondary" href={campaignSectionPath(campaignId, "factions")}><ArrowLeft size={14} /> BACK TO FACTIONS</Link><div className="faction-top"><FactionPublicArt faction={faction} /><div><p className="eyebrow">PUBLIC FACTION FILE</p><h2 id="faction-public-record-title">{faction.name}</h2><p className="record-detail-meta">{faction.status.toUpperCase()}</p></div></div><p>{faction.description || "No public description recorded yet."}</p><p className="record-meta"><Map size={13} /> {getPlaceBreadcrumb(places, faction.place_id) || "No primary place"}</p></section>;
}