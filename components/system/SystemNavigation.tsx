"use client";

import { usePathname } from "next/navigation";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { campaignLibraryPath, type CampaignLibrarySection } from "@/lib/campaign/routes";

export default function SystemNavigation({ campaignId, access, isGM }: {
  campaignId: string;
  access: { owner: boolean; canEdit: boolean };
  isGM: boolean;
}) {
  const pathname = usePathname();
  const sections: Array<{ id: CampaignLibrarySection; label: string }> = [
    { id: "ancestries", label: "Ancestries" },
    { id: "creature-traits", label: "Creature traits" },
    ...(isGM ? [{ id: "generation" as const, label: "Generation context" }] : []),
    ...(access.owner ? [{ id: "access" as const, label: "Library access" }] : []),
  ];

  return <div className="mb-7 flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-[var(--line)]">
    <nav aria-label="Library navigation" className="flex min-w-0 flex-wrap gap-x-5 gap-y-1">
      {sections.map(({ id, label }) => {
        const href = campaignLibraryPath(campaignId, id);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <CampaignRouteLink key={id} href={href} aria-current={active ? "page" : undefined}
          className={`border-b-2 px-0 py-3 font-mono text-[9px] tracking-[.08em] transition-colors focus-visible:outline focus-visible:outline-[var(--cyan)] ${active ? "border-[var(--cyan)] text-[var(--cyan)]" : "border-transparent text-[var(--dim)] hover:text-[var(--ink)]"}`}>
          {label}
        </CampaignRouteLink>;
      })}
    </nav>
    <span className="pb-3 font-mono text-[8px] tracking-[.1em] text-[var(--muted)]">
      ACCESS: {access.owner ? "OWNER" : access.canEdit ? "EDITOR" : "READ-ONLY"}
    </span>
  </div>;
}
