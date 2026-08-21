"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, FileText, FolderKanban, Gauge, Map, Network, SlidersHorizontal, UserRound, UsersRound } from "lucide-react";
import CampaignShell from "@/components/campaign-shell/CampaignShell";
import CampaignSidebar, { type CampaignSidebarNavGroup } from "@/components/campaign-shell/CampaignSidebar";
import CampaignTopbar from "@/components/campaign-shell/CampaignTopbar";
import { campaignNavigation } from "@/lib/campaign/navigation";
import { campaignPath, campaignSectionPath, campaignsPath, getCampaignSectionFromPath, type CampaignSection } from "@/lib/campaign/routes";

const icons = {
  overview: Gauge,
  jobs: BriefcaseBusiness,
  episodes: FolderKanban,
  characters: UsersRound,
  npcs: UserRound,
  factions: Network,
  places: Map,
  notes: FileText,
  members: UsersRound,
  settings: SlidersHorizontal,
} satisfies Record<CampaignSection, typeof Gauge>;

export default function CampaignRouteShell({ campaignId, campaignName, displayName, isGM, children }: { campaignId: string; campaignName: string; displayName: string; isGM: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeSection = getCampaignSectionFromPath(pathname, campaignId);

  if (pathname === campaignPath(campaignId) || pathname === `${campaignPath(campaignId)}/`) return children;

  const groups = campaignNavigation.reduce<CampaignSidebarNavGroup[]>((result, item) => {
    if (item.id === "settings" && !isGM) return result;
    const existing = result.find((group) => group.label === item.group);
    const navItem = { ...item, icon: icons[item.id], href: campaignSectionPath(campaignId, item.id) };
    if (existing) existing.items.push(navItem);
    else result.push({ label: item.group, items: [navItem] });
    return result;
  }, []);
  const activeLabel = campaignNavigation.find((item) => item.id === activeSection)?.label ?? "Overview";

  return <CampaignShell sidebar={<CampaignSidebar activeView={activeSection} campaignName={campaignName} campaignSwitchHref={campaignsPath()} displayName={displayName} isGM={isGM} mobileOpen={mobileOpen} navItems={groups} onCloseMobile={() => setMobileOpen(false)} />}>
    <CampaignTopbar activeLabel={activeLabel} campaignName={campaignName} onOpenNavigation={() => setMobileOpen(true)} />
    <div className="content-frame">{children}</div>
  </CampaignShell>;
}