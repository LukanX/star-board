import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Clock3,
  FileText,
  FolderKanban,
  LockKeyhole,
  Map,
} from "lucide-react";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import StatusPill from "@/components/ui/StatusPill";
import { recordDetailClassName, recordDetailMetaClassName, recordListClassName, recordMainClassName, recordMetaClassName, recordRowClassName, recordTitleRowClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type {
  ApiPlace,
  EpisodeNote,
  EpisodeRecord,
} from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function EpisodePublicRecord({
  campaignId,
  episode,
  notes,
  places,
  actions,
}: {
  campaignId: string;
  episode: EpisodeRecord;
  notes: EpisodeNote[];
  places: ApiPlace[];
  actions?: ReactNode;
}) {
  const placeLabel = getPlaceBreadcrumb(places, episode.place_id);

  return (
    <section
      aria-labelledby="episode-public-record-title"
      className={`${recordDetailClassName} episode-record-detail`}
    >
      <Link
        className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] w-fit"
        href={campaignSectionPath(campaignId, "episodes")}
      >
        <ArrowLeft size={14} /> BACK TO EPISODE LOG
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={eyebrowClassName}>
            EPISODE DETAIL // {episode.status.toUpperCase()}
          </p>
          <h2 id="episode-public-record-title">{episode.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusPill color={episode.status === "active" ? "cyan" : "muted"}>
              {episode.status.toUpperCase()}
            </StatusPill>
            <span className={recordMetaClassName}>
              <Clock3 size={13} />{" "}
              {new Date(episode.created_at).toLocaleDateString()}
            </span>
            {placeLabel ? (
              <span className={recordMetaClassName}>
                <Map size={13} /> {placeLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 max-[420px]:gap-1">
          {actions}
          <span className={recordDetailMetaClassName}>
            {episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}
          </span>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MarkdownPreview>
          <MarkdownPreviewToolbar>
            <FolderKanban size={14} /> PUBLIC BRIEF
          </MarkdownPreviewToolbar>
          <MarkdownContent
            source={episode.summary || "No public episode brief recorded yet."}
          />
        </MarkdownPreview>
        <MarkdownPreview>
          <MarkdownPreviewToolbar>
            <FolderKanban size={14} /> PLAYER CONTEXT{" "}
            <span>PLAYER VISIBLE</span>
          </MarkdownPreviewToolbar>
          <MarkdownContent
            source={
              episode.player_context_markdown ||
              episode.summary ||
              "No public episode context recorded yet."
            }
          />
        </MarkdownPreview>
      </div>
      <section className="mt-6" aria-labelledby="episode-notes-title">
        <div className="section-heading flex items-start justify-between gap-[15px]">
          <div>
            <p className={eyebrowClassName}>CAMPAIGN MEMORY</p>
            <h3 id="episode-notes-title">Episode notes</h3>
          </div>
          <span className={recordDetailMetaClassName}>{notes.length} visible</span>
        </div>
        {notes.length ? (
          <div className={recordListClassName}>
            {notes.map((note) => (
              <article className={recordRowClassName} key={note.id}>
                <div className={recordMainClassName}>
                  <div className={recordTitleRowClassName}>
                    <h4>{note.title}</h4>
                    <span className={recordMetaClassName}>
                      {note.visibility === "gm" ? (
                        <>
                          <LockKeyhole size={12} /> GM ONLY
                        </>
                      ) : (
                        <>
                          <FileText size={12} /> PLAYER
                        </>
                      )}
                    </span>
                  </div>
                  <MarkdownContent
                    source={note.body_markdown || "No note body recorded yet."}
                  />
                  <span className={recordMetaClassName}>
                    Added by {note.author.displayName}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={recordDetailMetaClassName}>
            No visible notes are attached to this episode.
          </p>
        )}
      </section>
    </section>
  );
}
