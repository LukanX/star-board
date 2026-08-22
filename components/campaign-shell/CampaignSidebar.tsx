"use client";

import type { ComponentType } from "react";
import { ChevronDown, Hexagon, Orbit, X } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import {
  microLabelClassName,
  mutedIconClassName,
  userAvatarClassName,
  liveDotClassName,
} from "@/components/ui/terminalStyles";

export type CampaignSidebarNavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  href: string;
  count?: string;
};
export type CampaignSidebarNavGroup = {
  label: string;
  items: CampaignSidebarNavItem[];
};
export type CampaignSidebarProps = {
  campaignName: string;
  navItems: CampaignSidebarNavGroup[];
  activeView: string;
  isGM: boolean;
  displayName: string;
  mobileOpen: boolean;
  campaignSwitchHref: string;
  onCloseMobile: () => void;
};

const navItemClassName = "flex w-full h-[39px] items-center gap-3 border-0 bg-transparent px-3 text-left text-[12px] text-[#8e9aaa] cursor-pointer transition-[background,color,transform] duration-[200ms] hover:bg-[rgba(255,255,255,.035)] hover:text-[var(--ink)]";

export function CampaignSidebar({
  campaignName,
  navItems,
  activeView,
  isGM,
  displayName,
  mobileOpen,
  campaignSwitchHref,
  onCloseMobile,
}: CampaignSidebarProps) {
  return (
    <aside
      data-campaign-sidebar
      className={`relative z-20 flex min-h-screen w-[252px] flex-[0_0_252px] flex-col border-r border-[var(--line)] bg-[#0b1018] px-[14px] pb-[17px] pt-[25px] max-[760px]:fixed max-[760px]:bottom-0 max-[760px]:left-0 max-[760px]:top-0 max-[760px]:-translate-x-[105%] max-[760px]:transition-transform max-[760px]:duration-[250ms] max-[760px]:ease-[ease] max-[760px]:shadow-[18px_0_50px_rgba(0,0,0,.4)] ${mobileOpen ? "max-[760px]:translate-x-0" : ""}`}
    >
      <div className="mb-[29px] flex items-center gap-[10px] px-[10px]">
        <div className="grid h-[35px] w-[35px] rotate-[30deg] place-items-center border border-[rgba(98,232,255,.65)] text-[var(--cyan)] shadow-[0_0_19px_rgba(98,232,255,.14),inset_0_0_12px_rgba(98,232,255,.12)] [&_svg]:-rotate-[30deg]">
          <Orbit size={21} strokeWidth={1.8} />
        </div>
        <div>
          <p className="m-0 text-[13px] font-[750] tracking-[.16em] text-[var(--ink)]">STAR BOARD</p>
          <p className="m-[3px_0_0] text-[var(--dim)] font-mono text-[7px] tracking-[.14em]">CAMPAIGN OPERATIONS</p>
        </div>
        <button
          aria-label="Close navigation"
          className="ml-auto hidden h-8 w-8 place-items-center border border-transparent bg-transparent p-0 text-[var(--muted)] cursor-pointer hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)] hover:text-[var(--ink)] max-[760px]:inline-grid"
          onClick={onCloseMobile}
          title="Close navigation"
          type="button"
        >
          <X size={18} />
        </button>
      </div>
      <CampaignRouteLink
        className="mb-[27px] flex min-h-[63px] cursor-pointer items-center gap-[11px] border border-[rgba(98,232,255,.22)] bg-[linear-gradient(120deg,rgba(98,232,255,.09),rgba(255,92,154,.04))] p-[10px_12px]"
        href={campaignSwitchHref}
      >
        <div className="grid h-[31px] w-[31px] place-items-center border border-[rgba(98,232,255,.4)] bg-[rgba(98,232,255,.08)] text-[var(--cyan)]">
          <Hexagon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <span className={microLabelClassName}>ACTIVE CAMPAIGN</span>
          <strong className="mt-[5px] block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-[650] tracking-[.02em] text-[var(--ink)]">{campaignName}</strong>
        </div>
        <ChevronDown size={15} className={mutedIconClassName} />
      </CampaignRouteLink>
      <nav className="side-nav flex-1" aria-label="Campaign navigation">
        {navItems.map((group) => (
          <div className="mb-6" key={group.label}>
            <p className="m-[0_12px_8px] text-[#576375] font-mono text-[8px] tracking-[.11em]">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <CampaignRouteLink
                  className={`${navItemClassName} ${isActive ? "bg-[rgba(98,232,255,.095)] text-[var(--cyan)] shadow-[inset_2px_0_0_var(--cyan)] hover:bg-[rgba(98,232,255,.12)] hover:text-[var(--cyan)]" : ""}`}
                  href={item.href}
                  key={item.id}
                  onNavigate={onCloseMobile}
                >
                  <Icon
                    size={17}
                    strokeWidth={activeView === item.id ? 2.1 : 1.7}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.count ? (
                    <span className={`font-mono text-[9px] ${isActive ? "text-[rgba(98,232,255,.65)]" : "text-[#526071]"}`}>{item.count}</span>
                  ) : null}
                </CampaignRouteLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="side-footer mt-auto">
        <div className="mb-[14px] ml-3 flex items-center gap-[7px] text-[#607080] font-mono text-[8px] tracking-[.11em]">
          <span className={liveDotClassName} /> SUPABASE SYNC ACTIVE
        </div>
        <div className="mt-[9px] flex items-center gap-[9px] border-t border-[var(--line)] px-[10px] pb-0 pt-[17px]">
          <div className={userAvatarClassName}>
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block text-[11px] font-semibold text-[var(--ink)]">{displayName}</strong>
            <span className="mt-[3px] block text-[var(--dim)] font-mono text-[7px] tracking-[.1em]">{isGM ? "GAME MASTER" : "PLAYER"}</span>
          </div>
        </div>
        <SignOutButton className={`${navItemClassName} mt-2 text-[var(--muted)] hover:text-[var(--pink)]`} label="Sign out" />
      </div>
    </aside>
  );
}

export default CampaignSidebar;
