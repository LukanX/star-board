import Link from "next/link";
import { ArrowLeft, CalendarClock, FileText, LockKeyhole, Pencil } from "lucide-react";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { campaignEntityPath, campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiCampaignNote, CampaignNoteEpisode } from "@/lib/campaign/types";

export default function NotePublicRecord({ campaignId, note, episode, onEdit }: { campaignId: string; note: ApiCampaignNote; episode?: CampaignNoteEpisode; onEdit?: () => void }) {
  const visibilityLabel = note.visibility === "gm" ? "GM NOTE" : "PLAYER NOTE";

  return <section aria-labelledby="note-public-record-title" className="record-detail">
    <Link className="button button-secondary w-fit" href={campaignSectionPath(campaignId, "notes")}><ArrowLeft size={14} /> BACK TO CAMPAIGN NOTES</Link>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">{visibilityLabel}</p><h2 id="note-public-record-title">{note.title}</h2><div className="mt-2 flex flex-wrap items-center gap-3"><span className="record-meta"><FileText size={13} /> Added by {note.author.displayName}</span><span className="record-meta"><CalendarClock size={13} /> {new Date(note.updated_at || note.created_at).toLocaleDateString()}</span>{episode ? <Link className="record-meta text-[var(--cyan)]" href={campaignEntityPath(campaignId, "episodes", episode.id)}>EPISODE // {episode.title}</Link> : <span className="record-meta">GLOBAL CAMPAIGN NOTE</span>}</div></div><span className="record-detail-meta">{note.visibility === "gm" ? <><LockKeyhole size={12} /> GM ONLY</> : "PLAYER VISIBLE"}</span></div>
    <div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> CAMPAIGN MEMORY <span>{note.visibility === "gm" ? "GM ONLY" : "PLAYER VISIBLE"}</span></div><MarkdownContent source={note.body_markdown || "No note body recorded yet."} /></div>
    {note.permissions.canEdit && onEdit ? <div className="character-form-actions"><button className="button button-secondary" onClick={onEdit} type="button"><Pencil size={14} /> EDIT NOTE</button></div> : null}
  </section>;
}