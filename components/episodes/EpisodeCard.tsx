import Link from "next/link";
import { ArrowUpRight, Clock3, FileText, Map } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import { recordMainClassName, recordMetaClassName, recordTitleRowClassName } from "@/components/ui/recordStyles";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace, EpisodeRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function EpisodeCard({ campaignId, episode, index, places }: { campaignId: string; episode: EpisodeRecord; index: number; places: ApiPlace[] }) {
  const placeLabel = getPlaceBreadcrumb(places, episode.place_id);
  const episodePath = campaignEntityPath(campaignId, "episodes", episode.id);

  return <article className={`min-h-[125px] flex items-center gap-[15px] px-[18px] py-[15px] border-b border-[var(--line)] last:border-b-0 max-[760px]:items-start ${episode.status === "active" ? "bg-[linear-gradient(90deg,rgba(98,232,255,.08),transparent_70%)]" : ""}`}>
    <div className="w-[57px] flex-[0_0_57px] border-r border-[var(--line)]"><span className="block text-[var(--dim)] font-mono text-[8px]">EP.</span><strong className="block mt-[5px] text-[var(--cyan)] font-mono text-[28px] font-[450]">{index + 1}</strong></div>
    <div className={recordMainClassName}><div className={recordTitleRowClassName}><h3><Link href={episodePath}>{episode.title}</Link></h3><StatusPill color={episode.status === "active" ? "cyan" : "muted"}>{episode.status.toUpperCase()}</StatusPill></div><p>{episode.summary || "No public episode brief recorded."}</p><span className={recordMetaClassName}><Clock3 size={13} /> {new Date(episode.created_at).toLocaleDateString()} <span className="meta-divider" /> <FileText size={13} /> {episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}{placeLabel ? <><span className="meta-divider" /><Map size={13} /> {placeLabel}</> : null}</span></div>
    <Link className="ml-auto inline-flex items-center gap-[6px] border-0 bg-transparent text-[var(--cyan)] font-mono text-[8px] tracking-[.1em] cursor-pointer" href={episodePath}>OPEN <ArrowUpRight size={14} /></Link>
  </article>;
}