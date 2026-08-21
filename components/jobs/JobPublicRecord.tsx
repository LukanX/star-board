import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BriefcaseBusiness, LockKeyhole, Map, Network, UserRound } from "lucide-react";
import VisualAsset from "@/components/ui/VisualAsset";
import StatusPill from "@/components/ui/StatusPill";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace, Mission } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function JobPublicRecord({ campaignId, job, places, isGM, actions }: { campaignId: string; job: Mission; places: ApiPlace[]; isGM: boolean; actions?: ReactNode }) {
  const placeLabel = getPlaceBreadcrumb(places, job.placeId);

  return <section aria-labelledby="job-public-record-title" className="record-detail job-record-detail">
    <Link className="button button-secondary w-fit" href={campaignSectionPath(campaignId, "jobs")}><ArrowLeft size={14} /> BACK TO JOB BOARD</Link>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="eyebrow">MISSION FILE // {job.status.toUpperCase()}</p><h2 id="job-public-record-title">{job.title}</h2><div className="mt-2 flex flex-wrap items-center gap-3"><StatusPill color={job.status === "open" ? "open" : job.accent}>{job.status === "open" ? "OPEN JOB" : job.category}</StatusPill><span className="record-meta">{placeLabel ? <><Map size={13} /> {placeLabel}</> : <><Map size={13} /> NO PRIMARY PLACE</>}</span></div></div>{actions ? <div className="record-row-actions">{actions}</div> : null}
    </div>
    <VisualAsset src={job.image} label={`${job.title} artwork`} className="job-detail-art h-64 w-full border border-[var(--line)] bg-[var(--panel-deep)] bg-cover bg-center sm:h-80" />
    <div className="grid gap-3 md:grid-cols-2">
      <div className="markdown-preview"><div className="preview-toolbar"><BriefcaseBusiness size={14} /> PUBLIC BRIEF</div><MarkdownContent source={job.summary || "No public mission brief recorded yet."} /></div>
      <div className="markdown-preview"><div className="preview-toolbar">{job.giverType === "NPC" ? <UserRound size={14} /> : <Network size={14} />} {job.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</div><p>{job.giver || "Unknown contact"}</p></div>
      <div className="markdown-preview"><div className="preview-toolbar"><BriefcaseBusiness size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span></div><MarkdownContent source={job.playerNotesMarkdown || "No player notes recorded yet."} /></div>
      {isGM ? <div className="markdown-preview"><div className="preview-toolbar"><LockKeyhole size={14} /> GM HOOK <span>PRIVATE</span></div><MarkdownContent source={job.hook || "No private hook recorded yet."} /></div> : null}
      {isGM ? <div className="markdown-preview md:col-span-2"><div className="preview-toolbar"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></div><MarkdownContent source={job.gmNotesMarkdown || "No private notes recorded yet."} /></div> : null}
    </div>
  </section>;
}