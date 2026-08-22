import Link from "next/link";
import { BookOpen, ChevronRight, LockKeyhole } from "lucide-react";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { CampaignNote } from "@/lib/campaign/types";

function noteAge(note: CampaignNote) {
  if (note.age) return note.age;
  const timestamp = Date.parse(note.updated_at || note.created_at);
  if (Number.isNaN(timestamp)) return "recently";
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

const accentClasses: Record<CampaignNote["accent"], string> = {
  cyan: "bg-[var(--cyan)] text-[var(--cyan)]",
  pink: "bg-[var(--pink)] text-[var(--pink)]",
  amber: "bg-[var(--amber)] text-[var(--amber)]",
  purple: "bg-[var(--purple)] text-[var(--purple)]",
};

export default function NoteCard({ campaignId, note, episodeTitle }: { campaignId: string; note: CampaignNote; episodeTitle?: string }) {
  const visibilityLabel = note.visibility === "gm" ? "GM ONLY" : "PLAYER";
  const scopeLabel = note.episode_id ? episodeTitle ? `EPISODE // ${episodeTitle}` : "EPISODE" : "GLOBAL";

  return <article className="min-h-[94px] flex items-center gap-[15px] px-[18px] py-[15px] border-b border-[var(--line)] last:border-b-0">
    <span aria-hidden="true" className={`w-[3px] h-[42px] flex-[0_0_3px] shadow-[0_0_11px_currentColor] ${accentClasses[note.accent]}`} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-3 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"><span>{scopeLabel}</span><span className={`inline-flex items-center gap-1 text-[var(--cyan)] ${note.visibility === "gm" ? "text-[var(--pink)]" : ""}`}>{note.visibility === "gm" ? <LockKeyhole size={12} /> : <BookOpen size={12} />} {visibilityLabel}</span></div>
      <h3 className="m-0 mt-[10px] mb-[6px] text-[14px]">{note.title}</h3>
      <p className="m-0 text-[var(--dim)] text-[10px]">Added by <strong className="text-[var(--muted)] font-medium">{note.author.displayName}</strong> <span className="meta-divider" /> {noteAge(note)}</p>
    </div>
    <Link aria-label={`Open note ${note.title}`} className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]" href={campaignEntityPath(campaignId, "notes", note.id)} title={`Open ${note.title}`}><ChevronRight size={17} /></Link>
  </article>;
}