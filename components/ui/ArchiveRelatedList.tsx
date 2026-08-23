import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { eyebrowClassName } from "@/components/ui/terminalStyles";

export type ArchiveRelatedListItem = {
  id: string;
  href: string;
  label: string;
  meta?: string;
  icon?: ReactNode;
};

export type ArchiveRelatedListProps = {
  eyebrow: string;
  title: string;
  emptyMessage: string;
  items: ArchiveRelatedListItem[];
  id?: string;
};

function getHeadingId(title: string, id?: string) {
  return id ?? `archive-related-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export default function ArchiveRelatedList({
  eyebrow,
  title,
  emptyMessage,
  items,
  id,
}: ArchiveRelatedListProps) {
  const headingId = getHeadingId(title, id);

  return (
    <section data-archive-related-list="true" aria-labelledby={headingId} className="grid gap-[8px]">
      <div>
        <p className={`${eyebrowClassName} !mb-1`}>{eyebrow}</p>
        <h3 id={headingId} className="m-0 text-[14px]">{title}</h3>
      </div>
      {items.length ? (
        <div className="grid gap-[1px] border border-[var(--line)] bg-[rgba(255,255,255,.018)]">
          {items.map((item) => (
            <CampaignRouteLink
              key={item.id}
              href={item.href}
              className="flex min-w-0 items-center gap-[10px] border-b border-[var(--line)] px-[12px] py-[10px] text-[var(--ink)] last:border-b-0 hover:bg-[rgba(98,232,255,.06)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-[-2px]"
            >
              {item.icon ? <span className="shrink-0 text-[var(--cyan)]">{item.icon}</span> : null}
              <span className="min-w-0 flex-1">
                <strong className="block [overflow-wrap:anywhere] text-[11px] font-[550]">{item.label}</strong>
                {item.meta ? <small className="block [overflow-wrap:anywhere] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">{item.meta}</small> : null}
              </span>
              <ArrowUpRight aria-hidden="true" className="shrink-0 text-[var(--cyan)]" size={14} />
            </CampaignRouteLink>
          ))}
        </div>
      ) : (
        <p className="m-0 border border-dashed border-[rgba(139,151,169,.28)] px-[12px] py-[14px] text-[var(--muted)] text-[10px]">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}