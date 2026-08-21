import Link from "next/link";
import { ArrowLeft, Clock3, FileText, FolderKanban, LockKeyhole, Map } from "lucide-react";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import StatusPill from "@/components/ui/StatusPill";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace, EpisodeNote, EpisodeRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function EpisodePublicRecord({ campaignId, episode, notes, places }: { campaignId: string; episode: EpisodeRecord; notes: EpisodeNote[]; places: ApiPlace[] }) {
  const placeLabel = getPlaceBreadcrumb(places, episode.place_id);

  return <section aria-labelledby="episode-public-record-title" className="record-detail episode-record-detail">
    <Link className="button button-secondary w-fit" href={campaignSectionPath(campaignId, "episodes")}><ArrowLeft size={14} /> BACK TO EPISODE LOG</Link>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">EPISODE DETAIL // {episode.status.toUpperCase()}</p><h2 id="episode-public-record-title">{episode.title}</h2><div className="mt-2 flex flex-wrap items-center gap-3"><StatusPill color={episode.status === "active" ? "cyan" : "muted"}>{episode.status.toUpperCase()}</StatusPill><span className="record-meta"><Clock3 size={13} /> {new Date(episode.created_at).toLocaleDateString()}</span>{placeLabel ? <span className="record-meta"><Map size={13} /> {placeLabel}</span> : null}</div></div><span className="record-detail-meta">{episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}</span></div>
    <div className="grid gap-3 md:grid-cols-2"><div className="markdown-preview"><div className="preview-toolbar"><FolderKanban size={14} /> PUBLIC BRIEF</div><MarkdownContent source={episode.summary || "No public episode brief recorded yet."} /></div><div className="markdown-preview"><div className="preview-toolbar"><FolderKanban size={14} /> PLAYER CONTEXT <span>PLAYER VISIBLE</span></div><MarkdownContent source={episode.player_context_markdown || episode.summary || "No public episode context recorded yet."} /></div></div>
    <section className="mt-6" aria-labelledby="episode-notes-title"><div className="section-heading"><div><p className="eyebrow">CAMPAIGN MEMORY</p><h3 id="episode-notes-title">Episode notes</h3></div><span className="record-detail-meta">{notes.length} visible</span></div>{notes.length ? <div className="record-list">{notes.map((note) => <article className="record-row" key={note.id}><div className="record-main"><div className="record-title-row"><h4>{note.title}</h4><span className="record-meta">{note.visibility === "gm" ? <><LockKeyhole size={12} /> GM ONLY</> : <><FileText size={12} /> PLAYER</>}</span></div><MarkdownContent source={note.body_markdown || "No note body recorded yet."} /><span className="record-meta">Added by {note.author.displayName}</span></div></article>)}</div> : <p className="record-detail-meta">No visible notes are attached to this episode.</p>}</section>
  </section>;
}