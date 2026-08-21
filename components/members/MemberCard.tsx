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

  return <article className="member-row">
    <div className="avatar" style={{ backgroundColor: avatarColors[index % avatarColors.length] }}>{initials}</div>
    <div className="member-copy"><strong>{member.displayName}</strong><span>{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div>
    <StatusPill color={member.role === "gm" ? "amber" : "cyan"}>{member.role === "gm" ? "GM" : "PLAYER"}</StatusPill>
    <span className="member-last">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
    {canManage ? <button aria-label={`Open ${member.displayName} options`} className="icon-button" onClick={() => onSelect(member)} title="Member options" type="button"><MoreHorizontal size={17} /></button> : member.userId === currentUserId ? <span aria-label="Your membership" className="member-current" title="Your membership"><UserRound size={15} /></span> : null}
  </article>;
}