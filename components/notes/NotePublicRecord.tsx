import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { recordDetailClassName, recordDetailMetaClassName, recordMetaClassName } from "@/components/ui/recordStyles";
import { campaignEntityPath, campaignSectionPath } from "@/lib/campaign/routes";
import type {
  ApiCampaignNote,
  CampaignNoteEpisode,
} from "@/lib/campaign/types";

export default function NotePublicRecord({
  campaignId,
  note,
  episode,
  onEdit,
}: {
  campaignId: string;
  note: ApiCampaignNote;
  episode?: CampaignNoteEpisode;
  onEdit?: () => void;
}) {
  const visibilityLabel = note.visibility === "gm" ? "GM NOTE" : "PLAYER NOTE";

  return (
    <section
      aria-labelledby="note-public-record-title"
      className={recordDetailClassName}
    >
      <Link
        className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] w-fit"
        href={campaignSectionPath(campaignId, "notes")}
      >
        <ArrowLeft size={14} /> BACK TO CAMPAIGN NOTES
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">{visibilityLabel}</p>
          <h2 id="note-public-record-title">{note.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={recordMetaClassName}>
              <FileText size={13} /> Added by {note.author.displayName}
            </span>
            <span className={recordMetaClassName}>
              <CalendarClock size={13} />{" "}
              {new Date(
                note.updated_at || note.created_at,
              ).toLocaleDateString()}
            </span>
            {episode ? (
              <Link
                className={`${recordMetaClassName} text-[var(--cyan)]`}
                href={campaignEntityPath(campaignId, "episodes", episode.id)}
              >
                EPISODE // {episode.title}
              </Link>
            ) : (
              <span className={recordMetaClassName}>GLOBAL CAMPAIGN NOTE</span>
            )}
          </div>
        </div>
        <span className={recordDetailMetaClassName}>
          {note.visibility === "gm" ? (
            <>
              <LockKeyhole size={12} /> GM ONLY
            </>
          ) : (
            "PLAYER VISIBLE"
          )}
        </span>
      </div>
      <MarkdownPreview>
        <MarkdownPreviewToolbar>
          <FileText size={14} /> CAMPAIGN MEMORY{" "}
          <span>{note.visibility === "gm" ? "GM ONLY" : "PLAYER VISIBLE"}</span>
        </MarkdownPreviewToolbar>
        <MarkdownContent
          source={note.body_markdown || "No note body recorded yet."}
        />
      </MarkdownPreview>
      {note.permissions.canEdit && onEdit ? (
        <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
            onClick={onEdit}
            type="button"
          >
            <Pencil size={14} /> EDIT NOTE
          </button>
        </div>
      ) : null}
    </section>
  );
}
