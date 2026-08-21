"use client";

import { ChevronRight, Command, Menu } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";

export type CampaignTopbarProps = { campaignName: string; activeLabel: string; onOpenNavigation: () => void };

export function CampaignTopbar({ campaignName, activeLabel, onOpenNavigation }: CampaignTopbarProps) {
  return <header className="topbar"><div className="topbar-left"><button aria-label="Open navigation" className="mobile-menu icon-button" onClick={onOpenNavigation} title="Open navigation" type="button"><Menu size={20} /></button><div className="crumb-mark"><Command size={14} /></div><span className="crumb-muted">{campaignName}</span><ChevronRight size={14} className="muted-icon" /><span className="crumb-current">{activeLabel.toUpperCase()}</span></div><div className="topbar-right"><SignOutButton compact className="icon-button" /></div></header>;
}

export default CampaignTopbar;