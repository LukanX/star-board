import { MoreHorizontal, UserRound } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import type { ApiCampaignMember } from "@/lib/campaign/types";

const avatarColors = ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"];

export default function MemberCard({
  member,
  index,
  currentUserId,
  isGM,
  onSelect,
}: {
  member: ApiCampaignMember;
  index: number;
  currentUserId: string;
  isGM: boolean;
  onSelect: (member: ApiCampaignMember) => void;
}) {
  const canManage = isGM && member.userId !== currentUserId;
  const initials = member.displayName.trim().slice(0, 2).toUpperCase() || "CM";

  return <article className="min-h-[69px] flex items-center gap-[15px] px-[18px] py-[15px] border-b border-[var(--line)] last:border-b-0 max-[760px]:gap-[9px] max-[760px]:pl-[12px] max-[760px]:pr-[10px]">
    <div className="avatar" style={{ backgroundColor: avatarColors[index % avatarColors.length] }}>{initials}</div>
    <div className="min-w-0 flex-1"><strong className="block text-[var(--ink)] text-[12px] font-[560]">{member.displayName}</strong><span className="block mt-[4px] text-[var(--dim)] font-mono text-[8px]">{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div>
    <StatusPill className="ml-[10px] max-[760px]:ml-0" color={member.role === "gm" ? "amber" : "cyan"}>{member.role === "gm" ? "GM" : "PLAYER"}</StatusPill>
    <span className="ml-auto text-[var(--dim)] font-mono text-[8px] tracking-[.11em] max-[1100px]:hidden">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
    {canManage ? <button aria-label={`Open ${member.displayName} options`} className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]" onClick={() => onSelect(member)} title="Member options" type="button"><MoreHorizontal size={17} /></button> : member.userId === currentUserId ? <span aria-label="Your membership" className="w-8 h-8 inline-grid place-items-center flex-[0_0_32px] border border-[rgba(98,232,255,.25)] text-[var(--cyan)] bg-[rgba(98,232,255,.06)]" title="Your membership"><UserRound size={15} /></span> : null}
  </article>;
}