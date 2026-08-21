"use client";

import type { ComponentType } from "react";
import { ChevronDown, Hexagon, Orbit, X } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";

export type CampaignSidebarNavItem = { id: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; href: string; count?: string };
export type CampaignSidebarNavGroup = { label: string; items: CampaignSidebarNavItem[] };
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

export function CampaignSidebar({ campaignName, navItems, activeView, isGM, displayName, mobileOpen, campaignSwitchHref, onCloseMobile }: CampaignSidebarProps) {
  return <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
    <div className="brand-lockup"><div className="brand-symbol"><Orbit size={21} strokeWidth={1.8} /></div><div><p className="brand-name">STAR BOARD</p><p className="brand-subtitle">CAMPAIGN OPERATIONS</p></div><button aria-label="Close navigation" className="mobile-close icon-button" onClick={onCloseMobile} title="Close navigation" type="button"><X size={18} /></button></div>
    <CampaignRouteLink className="campaign-switcher" href={campaignSwitchHref}><div className="campaign-orb"><Hexagon size={18} /></div><div className="campaign-switcher-copy"><span className="micro-label">ACTIVE CAMPAIGN</span><strong>{campaignName}</strong></div><ChevronDown size={15} className="muted-icon" /></CampaignRouteLink>
    <nav className="side-nav" aria-label="Campaign navigation">{navItems.map((group) => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map((item) => { const Icon = item.icon; return <CampaignRouteLink className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`} href={item.href} key={item.id} onNavigate={onCloseMobile}><Icon size={17} strokeWidth={activeView === item.id ? 2.1 : 1.7} /><span>{item.label}</span>{item.count ? <span className="nav-count">{item.count}</span> : null}</CampaignRouteLink>; })}</div>)}</nav>
    <div className="side-footer"><div className="sync-status"><span className="live-dot" /> SUPABASE SYNC ACTIVE</div><div className="profile-row"><div className="avatar avatar-user">{displayName.slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><span>{isGM ? "GAME MASTER" : "PLAYER"}</span></div></div><SignOutButton className="nav-item signout-nav-item" label="Sign out" /></div>
  </aside>;
}

export default CampaignSidebar;