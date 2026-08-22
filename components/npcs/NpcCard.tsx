import Link from "next/link";
import { UserRound } from "lucide-react";
import RecordPortrait from "@/components/ui/RecordPortrait";
import StatusPill from "@/components/ui/StatusPill";
import { recordMainClassName, recordMetaClassName, recordRowClassName, recordTitleRowClassName, recordVisibilityClassName } from "@/components/ui/recordStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { NpcRecord } from "@/lib/campaign/types";

const npcIconClassNames: Record<NpcRecord["color"], string> = {
  cyan: "text-[var(--cyan)] bg-[rgba(98,232,255,.08)]",
  pink: "text-[var(--pink)] bg-[rgba(255,92,154,.08)]",
  amber: "text-[var(--amber)] bg-[rgba(245,184,75,.08)]",
};

export default function NpcCard({ campaignId, npc }: { campaignId: string; npc: NpcRecord }) {
  return <Link aria-label={`Open public file for ${npc.name}`} className={`${recordRowClassName} cursor-pointer hover:bg-[rgba(98,232,255,.045)] focus-visible:outline-1 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-[-1px]`} href={campaignEntityPath(campaignId, "npcs", npc.id)}>
    <RecordPortrait src={getAttachedArtUrl(npc.art_url, npc.art_path)} label={`${npc.name} portrait`} className={`grid h-[62px] w-[62px] flex-[0_0_62px] place-items-center border border-current max-[760px]:h-[56px] max-[760px]:w-[56px] max-[760px]:flex-[0_0_56px] ${npcIconClassNames[npc.color]}`} fallback={<UserRound size={19} />} />
    <div className={recordMainClassName}><div className={recordTitleRowClassName}><h3>{npc.name}</h3><StatusPill color={npc.color}>{npc.role || "CONTACT"}</StatusPill></div><p>{npc.description || npc.species || "No public profile recorded."}</p><span className={recordMetaClassName}>{npc.species || "Unclassified contact"}</span></div>
    <div className={recordVisibilityClassName}><span>PLAYER NOTES</span></div>
  </Link>;
}