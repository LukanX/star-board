"use client";

import { ChevronRight, Command, Menu } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";

export type CampaignTopbarProps = {
  campaignName: string;
  activeLabel: string;
  onOpenNavigation: () => void;
};

export function CampaignTopbar({
  campaignName,
  activeLabel,
  onOpenNavigation,
}: CampaignTopbarProps) {
  return (
    <header data-campaign-topbar className="flex min-h-[69px] items-center justify-between border-b border-[var(--line)] bg-[rgba(8,11,17,.75)] px-[31px] max-[760px]:px-[17px]">
      <div className="flex min-w-0 items-center gap-[10px]">
        <button
          aria-label="Open navigation"
          className="hidden h-8 w-8 place-items-center border border-transparent bg-transparent p-0 text-[var(--muted)] cursor-pointer hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)] hover:text-[var(--ink)] max-[760px]:inline-grid"
          onClick={onOpenNavigation}
          title="Open navigation"
          type="button"
        >
          <Menu size={20} />
        </button>
        <div className="grid h-[25px] w-[25px] place-items-center border border-[rgba(98,232,255,.25)] bg-[rgba(98,232,255,.06)] text-[var(--cyan)] max-[760px]:hidden">
          <Command size={14} />
        </div>
        <span className="text-[var(--dim)] font-mono text-[9px] tracking-[.13em] max-[760px]:hidden">{campaignName}</span>
        <ChevronRight size={14} className="muted-icon max-[760px]:hidden" />
        <span className="text-[#cdd6e3] font-mono text-[9px] tracking-[.13em]">{activeLabel.toUpperCase()}</span>
      </div>
      <div className="topbar-right flex items-center gap-[10px] max-[760px]:gap-[5px]">
        <SignOutButton
          compact
          className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
        />
      </div>
    </header>
  );
}

export default CampaignTopbar;
