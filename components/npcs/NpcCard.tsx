import Link from "next/link";
import { UserRound } from "lucide-react";
import RecordPortrait from "@/components/ui/RecordPortrait";
import StatusPill from "@/components/ui/StatusPill";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { NpcRecord } from "@/lib/campaign/types";

export default function NpcCard({ campaignId, npc }: { campaignId: string; npc: NpcRecord }) {
  return <Link aria-label={`Open public file for ${npc.name}`} className="record-row npc-record-row" href={campaignEntityPath(campaignId, "npcs", npc.id)}>
    <RecordPortrait src={getAttachedArtUrl(npc.art_url, npc.art_path)} label={`${npc.name} portrait`} className={`record-icon record-icon-${npc.color} record-portrait`} fallback={<UserRound size={19} />} />
    <div className="record-main"><div className="record-title-row"><h3>{npc.name}</h3><StatusPill color={npc.color}>{npc.role || "CONTACT"}</StatusPill></div><p>{npc.description || npc.species || "No public profile recorded."}</p><span className="record-meta">{npc.species || "Unclassified contact"}</span></div>
    <div className="record-visibility"><span>PLAYER NOTES</span></div>
  </Link>;
}