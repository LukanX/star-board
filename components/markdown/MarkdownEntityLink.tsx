"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";

type EntityPreviewTarget = {
  campaignId: string;
  section: string;
  id: string;
};

type EntityPreview = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  href: string;
};

type MarkdownEntityLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href?: string;
  children?: ReactNode;
  node?: unknown;
};

const entitySections = new Set([
  "characters",
  "npcs",
  "places",
  "factions",
  "jobs",
  "enemies",
  "episodes",
]);

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseEntityTarget(href: string | undefined): EntityPreviewTarget | null {
  if (!href?.startsWith("/campaigns/")) return null;
  let pathname: string;
  try {
    pathname = new URL(href, "https://star-board.invalid").pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 4 || segments[0] !== "campaigns" || !entitySections.has(segments[2])) return null;
  const campaignId = decodeSegment(segments[1]);
  const id = decodeSegment(segments[3]);
  return campaignId && id ? { campaignId, section: segments[2], id } : null;
}

export default function MarkdownEntityLink({
  href,
  children,
  node: _node,
  className,
  ...anchorProps
}: MarkdownEntityLinkProps) {
  void _node;
  const target = parseEntityTarget(href);
  const campaignId = target?.campaignId;
  const section = target?.section;
  const entityId = target?.id;
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<EntityPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || !campaignId || !section || !entityId) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ section, id: entityId });
      void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/entities/preview?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("Entity preview unavailable.");
          const result = await response.json() as { entity?: EntityPreview };
          return result.entity ?? null;
        })
        .then((entity) => {
          if (controller.signal.aborted) return;
          setPreview(entity);
          setPreviewFailed(false);
          setIsLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setPreview(null);
          setPreviewFailed(true);
          setIsLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, campaignId, section, entityId]);

  const openPreview = () => {
    if (!target || isOpen) return;
    setPreview(null);
    setPreviewFailed(false);
    setIsLoading(true);
    setIsOpen(true);
  };
  const closePreview = () => {
    setIsOpen(false);
    setIsLoading(false);
  };

  if (!target) {
    return <a {...anchorProps} className={className} href={href}>{children}</a>;
  }

  const tooltipVisible = isOpen && (isLoading || preview || previewFailed);
  const entityLinkClassName = [
    className,
    "underline decoration-[var(--cyan)] decoration-1 underline-offset-2 hover:decoration-2",
  ].filter(Boolean).join(" ");

  return (
    <span
      className="relative inline-block max-w-full align-baseline"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closePreview();
      }}
      onFocus={openPreview}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") openPreview();
      }}
      onPointerLeave={closePreview}
    >
      <a
        {...anchorProps}
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        className={entityLinkClassName}
        href={href}
      >
        {children}
      </a>
      {tooltipVisible ? (
        <span
          className="pointer-events-auto absolute left-0 top-full z-[120] mt-2 block min-h-[7rem] w-[min(32rem,calc(100vw-2rem))] overflow-hidden border border-[var(--line)] bg-[#0a1118] text-left shadow-[0_12px_32px_rgba(0,0,0,.58)]"
          data-entity-preview="true"
          id={tooltipId}
          role="tooltip"
        >
          <span className="flex min-h-[7rem]">
            <span
              className="relative h-28 w-28 shrink-0 self-start bg-[rgba(98,232,255,.035)]"
              data-entity-preview-image="true"
            >
              {preview?.imageUrl ? (
                <Image
                  alt={`${preview.name} artwork`}
                  className="object-cover"
                  fill
                  sizes="(max-width: 640px) 40vw, 192px"
                  src={preview.imageUrl}
                  unoptimized
                />
              ) : (
                <span className="grid h-full w-full place-items-center border-r border-[var(--line)] text-[var(--cyan)]">
                  <ImageOff aria-hidden="true" size={20} />
                </span>
              )}
            </span>
            <span className="grid min-w-0 flex-1 content-center gap-2 overflow-hidden px-3 py-3" data-entity-preview-brief="true">
              {preview ? (
                <>
                  <strong className="break-words text-[var(--ink)] font-mono text-[10px] leading-[1.4]">{preview.name}</strong>
                  <span className="max-h-[5rem] overflow-hidden text-[var(--muted)] text-[10px] leading-[1.45]">{preview.description || "No brief description recorded."}</span>
                </>
              ) : isLoading ? (
                <span className="text-[var(--dim)] font-mono text-[9px]">LOADING RECORD...</span>
              ) : previewFailed ? (
                <span className="text-[var(--dim)] font-mono text-[9px]">PREVIEW UNAVAILABLE</span>
              ) : null}
            </span>
          </span>
        </span>
      ) : null}
    </span>
  );
}