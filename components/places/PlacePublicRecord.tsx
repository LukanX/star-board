import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, FileText, LockKeyhole, Map } from "lucide-react";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import { panelClassName, recordRowActionsClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";
import { PlaceArt } from "@/components/places/PlaceCard";

export default function PlacePublicRecord({
  campaignId,
  place,
  places,
  isGM,
  actions,
}: {
  campaignId: string;
  place: ApiPlace;
  places: ApiPlace[];
  isGM: boolean;
  actions?: ReactNode;
}) {
  return (
    <section
      data-place-detail-panel="true"
      aria-labelledby="place-public-record-title"
      className={`${panelClassName} min-h-[430px] shadow-[0_12px_30px_rgba(0,0,0,.12)] max-[760px]:min-h-0 max-[760px]:order-[-1]`}
    >
      <div
        data-place-detail="true"
        className="min-w-0 p-[21px] max-[760px]:p-[17px]"
      >
        <Link
          className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
          href={campaignSectionPath(campaignId, "places")}
        >
          <ArrowLeft size={14} /> BACK TO PLACES
        </Link>
        <div
          data-place-detail-heading="true"
          className="flex items-start justify-between gap-[15px] pb-[17px] border-b border-[var(--line)] max-[420px]:gap-[8px]"
        >
          <div className="min-w-0">
            <p className={eyebrowClassName}>{place.kind.toUpperCase()} RECORD</p>
            <h2
              className="m-0 mb-2 text-[24px] [overflow-wrap:anywhere] max-[760px]:text-[20px]"
              id="place-public-record-title"
            >
              {place.name}
            </h2>
            <p
              data-place-breadcrumb="true"
              className="flex items-center gap-[6px] m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] leading-[1.5] flex-wrap [overflow-wrap:anywhere] max-[420px]:items-start"
            >
              <Map
                className="max-[420px]:mt-[2px] max-[420px]:flex-[0_0_auto]"
                size={13}
              />{" "}
              {getPlaceBreadcrumb(places, place.id)}
            </p>
          </div>
          {actions ? (
            <div data-place-detail-actions="true" className={`${recordRowActionsClassName} max-[420px]:gap-0`}>
              {actions}
            </div>
          ) : null}
        </div>
        <PlaceArt place={place} variant="detail" />
        <div
          data-place-detail-body="true"
          className="grid gap-[18px] pt-[19px]"
        >
          <div data-place-public-brief="true" className="grid gap-[8px]">
            <p className={eyebrowClassName}>PUBLIC BRIEF</p>
            <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">
              {place.description || "No public description recorded yet."}
            </p>
          </div>
          <MarkdownPreview data-place-public-preview="true">
            <MarkdownPreviewToolbar data-place-public-toolbar="true">
              <FileText size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span>
            </MarkdownPreviewToolbar>
            <p>
              {place.player_notes_markdown || "No player notes recorded yet."}
            </p>
          </MarkdownPreview>
          {isGM ? (
            <MarkdownPreview
              data-place-private-preview="true"
              className="border-[rgba(255,92,154,.25)]"
            >
              <MarkdownPreviewToolbar className="text-[var(--pink)]">
                <LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span>
              </MarkdownPreviewToolbar>
              <p>
                {place.gm_notes_markdown || "No private notes recorded yet."}
              </p>
            </MarkdownPreview>
          ) : null}
        </div>
      </div>
    </section>
  );
}
