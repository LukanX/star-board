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

export default function NoteCard({ campaignId, note, episodeTitle }: { campaignId: string; note: CampaignNote; episodeTitle?: string }) {
  const visibilityLabel = note.visibility === "gm" ? "GM ONLY" : "PLAYER";
  const scopeLabel = note.episode_id ? episodeTitle ? `EPISODE // ${episodeTitle}` : "EPISODE" : "GLOBAL";

  return <article className="note-row">
    <span aria-hidden="true" className={`accent-mark accent-${note.accent}`} />
    <div className="note-main">
      <div className="note-meta"><span>{scopeLabel}</span><span className={`note-visibility ${note.visibility === "gm" ? "note-private" : ""}`}>{note.visibility === "gm" ? <LockKeyhole size={12} /> : <BookOpen size={12} />} {visibilityLabel}</span></div>
      <h3>{note.title}</h3>
      <p>Added by <strong>{note.author.displayName}</strong> <span className="meta-divider" /> {noteAge(note)}</p>
    </div>
    <Link aria-label={`Open note ${note.title}`} className="icon-button" href={campaignEntityPath(campaignId, "notes", note.id)} title={`Open ${note.title}`}><ChevronRight size={17} /></Link>
  </article>;
}