import Link from "next/link";
import { BookOpen, Map, UserRound } from "lucide-react";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, NpcRecord } from "@/lib/campaign/types";

export default function NpcPublicRecord({ campaignId, npc, places }: { campaignId: string; npc: NpcRecord; places: ApiPlace[] }) {
  return <section aria-labelledby="npc-public-record-title" className="record-detail npc-record-detail">
    <Link className="button button-secondary" href={campaignSectionPath(campaignId, "npcs")}>BACK TO NPCS</Link>
    <div className="npc-detail-preview"><RecordPortrait src={getAttachedArtUrl(npc.art_url, npc.art_path)} label={`${npc.name} portrait`} className="npc-detail-portrait record-portrait" fallback={<UserRound size={19} />} /><div className="npc-detail-copy"><div><p className="eyebrow">PUBLIC CONTACT FILE</p><h2 id="npc-public-record-title">{npc.name}</h2><p className="record-detail-meta">{npc.species || "Unclassified"}{" // "}{npc.role || "Contact"}</p></div><p>{npc.description || "No public description recorded yet."}</p><span className="record-meta"><Map size={13} /> {getPlaceBreadcrumb(places, npc.place_id) || "No primary place"}</span></div><div className="npc-detail-notes markdown-preview"><div className="preview-toolbar"><BookOpen size={14} /> PLAYER NOTES</div><p>{npc.player_notes_markdown || "No player notes recorded yet."}</p></div></div>
  </section>;
}