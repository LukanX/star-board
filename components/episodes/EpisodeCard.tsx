import Link from "next/link";
import { ArrowUpRight, Clock3, FileText, Map } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace, EpisodeRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function EpisodeCard({ campaignId, episode, index, places }: { campaignId: string; episode: EpisodeRecord; index: number; places: ApiPlace[] }) {
  const placeLabel = getPlaceBreadcrumb(places, episode.place_id);
  const episodePath = campaignEntityPath(campaignId, "episodes", episode.id);

  return <article className={`episode-row ${episode.status === "active" ? "episode-current" : ""}`}>
    <div className={`episode-number episode-number-${episode.accent}`}><span>EP.</span><strong>{index + 1}</strong></div>
    <div className="episode-info"><div className="record-title-row"><h3><Link href={episodePath}>{episode.title}</Link></h3><StatusPill color={episode.status === "active" ? "cyan" : "muted"}>{episode.status.toUpperCase()}</StatusPill></div><p>{episode.summary || "No public episode brief recorded."}</p><span className="record-meta"><Clock3 size={13} /> {new Date(episode.created_at).toLocaleDateString()} <span className="meta-divider" /> <FileText size={13} /> {episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}{placeLabel ? <><span className="meta-divider" /><Map size={13} /> {placeLabel}</> : null}</span></div>
    <Link className="episode-open" href={episodePath}>OPEN <ArrowUpRight size={14} /></Link>
  </article>;
}