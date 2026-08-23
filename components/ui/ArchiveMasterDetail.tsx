"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { panelClassName } from "@/components/ui/recordStyles";
import { accentIconCyanClassName, eyebrowClassName } from "@/components/ui/terminalStyles";

export type ArchiveMasterDetailProps = {
  selectedId: string | null;
  toolbar?: ReactNode;
  selectorEyebrow: string;
  selectorTitle: string;
  selectorIcon?: ReactNode;
  selector: ReactNode;
  preview: ReactNode;
  emptyPreview: ReactNode;
  layoutDataAttribute?: string;
  selectorPanelDataAttribute?: string;
  previewPanelDataAttribute?: string;
  previewContentDataAttribute?: string;
};

export default function ArchiveMasterDetail({
  selectedId,
  toolbar,
  selectorEyebrow,
  selectorTitle,
  selectorIcon,
  selector,
  preview,
  emptyPreview,
  layoutDataAttribute,
  selectorPanelDataAttribute,
  previewPanelDataAttribute,
  previewContentDataAttribute,
}: ArchiveMasterDetailProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const layoutData = layoutDataAttribute ? { [layoutDataAttribute]: "true" } : {};
  const selectorPanelData = selectorPanelDataAttribute ? { [selectorPanelDataAttribute]: "true" } : {};
  const previewPanelData = previewPanelDataAttribute ? { [previewPanelDataAttribute]: "true" } : {};
  const previewContentData = previewContentDataAttribute ? { [previewContentDataAttribute]: "true" } : {};

  useEffect(() => {
    if (!selectedId || !shellRef.current) return;

    const heading = shellRef.current.querySelector<HTMLElement>(
      '[data-archive-preview-heading="true"]',
    );
    if (!heading) return;

    heading.focus({ preventScroll: true });

    if (window.matchMedia("(max-width: 760px)").matches) {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      heading.scrollIntoView({ behavior, block: "start" });
    }
  }, [selectedId]);

  return (
    <div ref={shellRef} data-archive-master-detail="true" className="grid gap-[14px]">
      {toolbar}
      <div {...layoutData} className="grid grid-cols-[minmax(260px,.78fr)_minmax(0,1.22fr)] items-start gap-[14px] max-[760px]:grid-cols-1">
        <section
          {...selectorPanelData}
          data-archive-selector-panel="true"
          className={`${panelClassName} min-w-0 overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,.12)] max-[760px]:order-[1]`}
        >
          <div className="panel-topline flex items-start justify-between border-b border-[var(--line)] px-[21px] pb-4 pt-5">
            <div>
              <p className={`${eyebrowClassName} !mb-2`}>{selectorEyebrow}</p>
              <h2>{selectorTitle}</h2>
            </div>
            {selectorIcon ? <div className={accentIconCyanClassName}>{selectorIcon}</div> : null}
          </div>
          {selector}
        </section>
        <section
          {...previewPanelData}
          id="archive-preview-panel"
          data-archive-preview-panel="true"
          className={`${panelClassName} min-w-0 min-h-[430px] overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,.12)] max-[760px]:min-h-0 max-[760px]:order-[-1]`}
        >
          {selectedId ? (
            <div
              {...previewContentData}
              data-archive-preview-heading="true"
              tabIndex={-1}
              className="min-w-0 p-[21px] outline-0 max-[760px]:p-[17px] focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-inset"
            >
              {preview}
            </div>
          ) : (
            emptyPreview
          )}
        </section>
      </div>
    </div>
  );
}