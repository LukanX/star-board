import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { panelClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";

export type ArchiveRecordShellProps = {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  titleId: string;
  metadata?: ReactNode;
  actions?: ReactNode;
  artwork: ReactNode;
  body: ReactNode;
  related?: ReactNode;
  panelDataAttribute?: string;
  contentDataAttribute?: string;
  headingDataAttribute?: string;
  artworkDataAttribute?: string;
  bodyDataAttribute?: string;
  className?: string;
};

export default function ArchiveRecordShell({
  backHref,
  backLabel,
  eyebrow,
  title,
  titleId,
  metadata,
  actions,
  artwork,
  body,
  related,
  panelDataAttribute,
  contentDataAttribute,
  headingDataAttribute,
  artworkDataAttribute,
  bodyDataAttribute,
  className = "",
}: ArchiveRecordShellProps) {
  const panelData = panelDataAttribute ? { [panelDataAttribute]: "true" } : {};
  const contentData = contentDataAttribute ? { [contentDataAttribute]: "true" } : {};
  const headingData = headingDataAttribute ? { [headingDataAttribute]: "true" } : {};
  const artworkData = artworkDataAttribute ? { [artworkDataAttribute]: "true" } : {};
  const bodyData = bodyDataAttribute ? { [bodyDataAttribute]: "true" } : {};

  return (
    <section
      {...panelData}
      data-archive-record="true"
      aria-labelledby={titleId}
      className={`${panelClassName} min-h-[430px] overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,.12)] max-[760px]:min-h-0 ${className}`}
    >
      <div {...contentData} className="min-w-0 p-[21px] max-[760px]:p-[17px]">
        <CampaignRouteLink
          className="inline-flex h-[37px] items-center justify-center gap-2 whitespace-nowrap border border-[var(--line)] bg-[rgba(255,255,255,.035)] px-[14px] text-[var(--muted)] font-mono text-[9px] tracking-[.12em] transition-[transform,background,border] duration-[200ms] hover:-translate-y-px hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2"
          href={backHref}
        >
          <ArrowLeft aria-hidden="true" size={14} /> {backLabel}
        </CampaignRouteLink>
        <div
          {...headingData}
          data-archive-record-heading="true"
          className="flex items-start justify-between gap-[15px] border-b border-[var(--line)] pb-[17px] pt-[21px] max-[420px]:gap-[8px]"
        >
          <div className="min-w-0">
            <p className={eyebrowClassName}>{eyebrow}</p>
            <h2 id={titleId} className="m-0 mb-2 text-[24px] [overflow-wrap:anywhere] max-[760px]:text-[20px]">
              {title}
            </h2>
            {metadata ? <div className="mt-[8px] min-w-0">{metadata}</div> : null}
          </div>
          {actions ? <div className="ml-auto flex items-center gap-[2px] max-[420px]:gap-0">{actions}</div> : null}
        </div>
        <div {...artworkData} data-archive-record-artwork="true" className="relative pt-[18px]">
          {artwork}
        </div>
        <div {...bodyData} data-archive-record-body="true" className="grid gap-[18px] pt-[19px]">
          {body}
        </div>
        {related ? <div data-archive-record-related="true" className="grid gap-3 pt-[22px]">{related}</div> : null}
      </div>
    </section>
  );
}