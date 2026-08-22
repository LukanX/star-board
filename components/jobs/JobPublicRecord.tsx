import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  LockKeyhole,
  Map,
  Network,
  UserRound,
} from "lucide-react";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import VisualAsset from "@/components/ui/VisualAsset";
import StatusPill from "@/components/ui/StatusPill";
import { recordDetailClassName, recordMetaClassName, recordRowActionsClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace, Mission } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function JobPublicRecord({
  campaignId,
  job,
  places,
  isGM,
  actions,
}: {
  campaignId: string;
  job: Mission;
  places: ApiPlace[];
  isGM: boolean;
  actions?: ReactNode;
}) {
  const placeLabel = getPlaceBreadcrumb(places, job.placeId);

  return (
    <section
      aria-labelledby="job-public-record-title"
      className={`${recordDetailClassName} job-record-detail`}
    >
      <Link
        className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] w-fit"
        href={campaignSectionPath(campaignId, "jobs")}
      >
        <ArrowLeft size={14} /> BACK TO JOB BOARD
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={eyebrowClassName}>MISSION FILE // {job.status.toUpperCase()}</p>
          <h2 id="job-public-record-title">{job.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusPill color={job.status === "open" ? "open" : job.accent}>
              {job.status === "open" ? "OPEN JOB" : job.category}
            </StatusPill>
            <span className={recordMetaClassName}>
              {placeLabel ? (
                <>
                  <Map size={13} /> {placeLabel}
                </>
              ) : (
                <>
                  <Map size={13} /> NO PRIMARY PLACE
                </>
              )}
            </span>
          </div>
        </div>
        {actions ? <div className={recordRowActionsClassName}>{actions}</div> : null}
      </div>
      <VisualAsset
        downloadName={job.title}
        src={job.image}
        label={`${job.title} artwork`}
        className="job-detail-art h-64 w-full border border-[var(--line)] bg-[var(--panel-deep)] bg-cover bg-center sm:h-80"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <MarkdownPreview>
          <MarkdownPreviewToolbar>
            <BriefcaseBusiness size={14} /> PUBLIC BRIEF
          </MarkdownPreviewToolbar>
          <MarkdownContent
            source={job.summary || "No public mission brief recorded yet."}
          />
        </MarkdownPreview>
        <MarkdownPreview>
          <MarkdownPreviewToolbar>
            {job.giverType === "NPC" ? (
              <UserRound size={14} />
            ) : (
              <Network size={14} />
            )}{" "}
            {job.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}
          </MarkdownPreviewToolbar>
          <p>{job.giver || "Unknown contact"}</p>
        </MarkdownPreview>
        <MarkdownPreview>
          <MarkdownPreviewToolbar>
            <BriefcaseBusiness size={14} /> PLAYER NOTES{" "}
            <span>PLAYER VISIBLE</span>
          </MarkdownPreviewToolbar>
          <MarkdownContent
            source={job.playerNotesMarkdown || "No player notes recorded yet."}
          />
        </MarkdownPreview>
        {isGM ? (
          <MarkdownPreview>
            <MarkdownPreviewToolbar>
              <LockKeyhole size={14} /> GM HOOK <span>PRIVATE</span>
            </MarkdownPreviewToolbar>
            <MarkdownContent
              source={job.hook || "No private hook recorded yet."}
            />
          </MarkdownPreview>
        ) : null}
        {isGM ? (
          <MarkdownPreview className="md:col-span-2">
            <MarkdownPreviewToolbar>
              <LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span>
            </MarkdownPreviewToolbar>
            <MarkdownContent
              source={job.gmNotesMarkdown || "No private notes recorded yet."}
            />
          </MarkdownPreview>
        ) : null}
      </div>
    </section>
  );
}
