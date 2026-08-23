import { UserRound } from "lucide-react";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { recordMainClassName, recordRowClassName } from "@/components/ui/recordStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import type { NpcRecord } from "@/lib/campaign/types";

const npcIconClassNames: Record<NpcRecord["color"], string> = {
  cyan: "text-[var(--cyan)] bg-[rgba(98,232,255,.08)]",
  pink: "text-[var(--pink)] bg-[rgba(255,92,154,.08)]",
  amber: "text-[var(--amber)] bg-[rgba(245,184,75,.08)]",
};

const npcSelectionClassNames = {
  selected: "bg-[rgba(98,232,255,.095)] hover:bg-[rgba(98,232,255,.14)]",
  idle: "hover:bg-[rgba(98,232,255,.045)]",
};

export default function NpcCard({ npc, selected, onSelect }: { campaignId: string; npc: NpcRecord; selected: boolean; onSelect: (npcId: string) => void }) {
  return <button aria-label={`Select ${npc.name}`} aria-controls="archive-preview-panel" aria-pressed={selected} className={`${recordRowClassName} w-full cursor-pointer text-left focus-visible:outline-1 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-[-1px] ${npcSelectionClassNames[selected ? "selected" : "idle"]}`} onClick={() => onSelect(npc.id)} type="button">
    <RecordPortrait src={getAttachedArtUrl(npc.art_url, npc.art_path)} label={`${npc.name} portrait`} className={`grid h-[62px] w-[62px] flex-[0_0_62px] place-items-center border border-current max-[760px]:h-[56px] max-[760px]:w-[56px] max-[760px]:flex-[0_0_56px] ${npcIconClassNames[npc.color]}`} fallback={<UserRound size={19} />} />
    <div className={recordMainClassName}><h3 className="m-0 text-[13px] text-[var(--ink)] [overflow-wrap:anywhere]">{npc.name}</h3><p>{npc.description || "No public profile recorded."}</p></div>
  </button>;
}