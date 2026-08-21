import Link from "next/link";
import { MoreHorizontal, Sparkles, Vote } from "lucide-react";
import VisualAsset from "@/components/ui/VisualAsset";
import StatusPill from "@/components/ui/StatusPill";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { Mission } from "@/lib/campaign/types";

export default function JobCard({ campaignId, job, isGM, index, compact = false, onVote, onEdit, onPromote }: {
  campaignId: string;
  job: Mission;
  isGM: boolean;
  index: number;
  compact?: boolean;
  onVote: (jobId: string) => void;
  onEdit?: (job: Mission) => void;
  onPromote?: (jobId: string) => void;
}) {
  return <article className={`mission-card mission-${job.accent} ${compact ? "mission-compact" : ""}`}>
    <VisualAsset src={job.image} label={`${job.title} artwork`} className="mission-art" />
    <div className="mission-art-overlay" />
    <div className="mission-index">0{index + 1}</div>
    <div className="mission-content">
      <div className="mission-meta"><StatusPill color={job.status === "open" ? "open" : job.accent}>{job.status === "open" ? "OPEN JOB" : job.category}</StatusPill></div>
      <Link className="no-underline text-inherit hover:text-[var(--cyan)]" href={campaignEntityPath(campaignId, "jobs", job.id)}><h3>{job.title}</h3></Link>
      <p>{job.summary}</p>
      <div className="mission-footer"><span className="giver"><span className="giver-glyph">{job.giverType === "NPC" ? "N" : "F"}</span><span><small>{job.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</small><strong>{job.giver}</strong></span></span></div>
    </div>
    <div className="mission-vote">
      <span><strong>{job.votes.toString().padStart(2, "0")}</strong> votes</span>
      {job.status === "open" ? <button aria-label={`${job.voted ? "Remove vote from" : "Vote for"} ${job.title}`} className={`vote-button ${job.voted ? "vote-active" : ""}`} onClick={() => onVote(job.id)} type="button"><Vote size={15} /> {job.voted ? "VOTED" : "VOTE"}</button> : null}
      {isGM && onEdit ? <button aria-label={`Edit ${job.title}`} className="mission-more icon-button" onClick={() => onEdit(job)} title="Edit mission" type="button"><MoreHorizontal size={16} /></button> : null}
      {isGM && job.status === "open" && onPromote ? <button aria-label={`Promote ${job.title} to an episode`} className="mission-more mission-promote icon-button" onClick={() => onPromote(job.id)} title="Promote to episode" type="button"><Sparkles size={16} /></button> : null}
    </div>
  </article>;
}