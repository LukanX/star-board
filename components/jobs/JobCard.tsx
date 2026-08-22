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
  const missionContentClassName = compact
    ? "relative z-[1] p-[42px_20px_75px]"
    : "relative z-[1] p-[49px_20px_75px]";
  const missionFooterClassName = compact
    ? "flex items-end justify-between gap-[10px] mt-[20px]"
    : "flex items-end justify-between gap-[10px] mt-[25px]";
  const missionCardClassName = compact
    ? "block relative min-h-[248px] overflow-hidden border-b border-[var(--line)] bg-[var(--panel-deep)]"
    : "block relative min-h-[307px] overflow-hidden border-b border-[var(--line)] bg-[var(--panel-deep)] max-[760px]:min-h-[300px]";
  const missionActionClassName = "absolute top-auto bottom-[74px] w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]";

  return <article className={missionCardClassName}>
    <VisualAsset src={job.image} label={`${job.title} artwork`} className="absolute inset-0 h-full w-full bg-cover bg-center opacity-[.55] saturate-[.78] contrast-[1.08]" />
    <div aria-hidden="true" data-art-overlay="true" className="absolute inset-0 h-full w-full bg-[linear-gradient(180deg,rgba(12,17,25,.25)_0%,rgba(12,17,25,.5)_40%,var(--panel-deep)_90%)]" />
    <div data-mission-index="true" className="z-[1] absolute top-[13px] left-[13px] text-[rgba(255,255,255,.75)] font-mono text-[9px]">0{index + 1}</div>
    <div data-mission-content="true" className={missionContentClassName}>
      <div data-mission-meta="true" className="flex items-center gap-[10px] mb-[11px]"><StatusPill color={job.status === "open" ? "open" : job.accent}>{job.status === "open" ? "OPEN JOB" : job.category}</StatusPill></div>
      <Link className="no-underline text-inherit hover:text-[var(--cyan)]" href={campaignEntityPath(campaignId, "jobs", job.id)}><h3 className="m-0 mb-[7px] !text-[17px] tracking-[-.02em] max-[760px]:!text-[14px]">{job.title}</h3></Link>
      <p data-mission-summary="true" className="!max-w-[500px] m-0 text-[var(--muted)] text-[11px] leading-[1.55] max-[760px]:text-[10px]">{job.summary}</p>
      <div data-mission-footer="true" className={missionFooterClassName}><span data-giver="true" className="flex items-center gap-2 min-w-0"><span data-giver-glyph="true" className="w-[22px] h-[22px] grid place-items-center border border-[rgba(98,232,255,.32)] text-[var(--cyan)] font-mono text-[9px]">{job.giverType === "NPC" ? "N" : "F"}</span><span><small data-giver-label="true" className="text-[var(--dim)] font-mono text-[7px] tracking-[.11em]">{job.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</small><strong data-giver-name="true" className="block max-w-[150px] overflow-hidden text-[#cfd8e5] text-[10px] font-[560] text-ellipsis whitespace-nowrap mt-[3px]">{job.giver}</strong></span></span></div>
    </div>
    <div data-mission-vote="true" className="absolute left-0 right-0 bottom-0 z-[1] h-[60px] flex flex-row items-center justify-end gap-2 p-0 pr-[19px] bg-[rgba(8,11,17,.65)] border-t border-[var(--line)] max-[760px]:pr-[10px] max-[420px]:pr-[7px]">
      <span data-vote-count="true" className="mr-auto text-[var(--dim)] font-mono text-[8px] max-[420px]:text-[7px]"><strong data-vote-total="true" className="mr-[4px] text-[var(--ink)] text-[17px] font-[550] max-[760px]:text-[14px] max-[420px]:text-[12px] max-[420px]:block">{job.votes.toString().padStart(2, "0")}</strong> votes</span>
      {job.status === "open" ? <button aria-label={`${job.voted ? "Remove vote from" : "Vote for"} ${job.title}`} className={`min-w-[75px] h-[29px] !inline-flex items-center justify-center gap-[6px] font-mono text-[8px] tracking-[.1em] cursor-pointer max-[760px]:min-w-[63px] ${job.voted ? "bg-[var(--cyan)] text-[#071016] border border-[var(--cyan)]" : "border border-[rgba(98,232,255,.34)] bg-[rgba(98,232,255,.05)] text-[var(--cyan)] hover:bg-[rgba(98,232,255,.13)]"}`} onClick={() => onVote(job.id)} type="button"><Vote size={15} /> {job.voted ? "VOTED" : "VOTE"}</button> : null}
      {isGM && onEdit ? <button aria-label={`Edit ${job.title}`} className={`${missionActionClassName} right-[8px]`} onClick={() => onEdit(job)} title="Edit mission" type="button"><MoreHorizontal size={16} /></button> : null}
      {isGM && job.status === "open" && onPromote ? <button aria-label={`Promote ${job.title} to an episode`} className={`${missionActionClassName} right-[45px]`} onClick={() => onPromote(job.id)} title="Promote to episode" type="button"><Sparkles size={16} /></button> : null}
    </div>
  </article>;
}