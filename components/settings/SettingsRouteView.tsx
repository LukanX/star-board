"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { FileText, Palette, Sparkles } from "lucide-react";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import CampaignAiSettings from "@/components/settings/CampaignAiSettings";
import CampaignDetailsSettings from "@/components/settings/CampaignDetailsSettings";
import CampaignVisualStyles from "@/components/settings/CampaignVisualStyles";
import OpenRouterConnectionSettings from "@/components/settings/OpenRouterConnectionSettings";
import PageLayout from "@/components/ui/PageLayout";

type CampaignDetails = {
  name: string;
  description: string;
};

type SettingsTab = "details" | "visuals" | "ai";

const settingsTabs = [
  { id: "details", label: "CAMPAIGN DETAILS", description: "Name and briefing", icon: FileText },
  { id: "visuals", label: "VISUAL STYLES", description: "Campaign art direction", icon: Palette },
  { id: "ai", label: "AI SETUP", description: "Provider and model access", icon: Sparkles },
] as const satisfies ReadonlyArray<{ id: SettingsTab; label: string; description: string; icon: typeof FileText }>;

export default function SettingsRouteView({
  campaignId,
  initialCampaign,
}: {
  campaignId: string;
  initialCampaign: CampaignDetails;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("details");
  const tabButtonRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  const { clearDirty, confirmNavigation } = useDirtyForm();

  const selectTab = (nextTab: SettingsTab, shouldFocus = false) => {
    if (nextTab === activeTab) {
      if (shouldFocus) tabButtonRefs.current[nextTab]?.focus();
      return;
    }

    if (!confirmNavigation()) return;

    clearDirty();
    setActiveTab(nextTab);
    if (shouldFocus) {
      window.requestAnimationFrame(() => tabButtonRefs.current[nextTab]?.focus());
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % settingsTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + settingsTabs.length) % settingsTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = settingsTabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    selectTab(settingsTabs[nextIndex].id, true);
  };

  return (
    <PageLayout
      eyebrow="GAME MASTER CONTROL"
      title="Campaign settings"
      description="Shape campaign identity, visual direction, and the AI tools available to your crew."
    >
      <div className="grid gap-5" data-settings-tabs>
        <div
          aria-label="Campaign settings sections"
          className="grid grid-cols-3 border border-[var(--line)] bg-[rgba(16,21,30,.78)] max-[760px]:grid-cols-1"
          role="tablist"
        >
          {settingsTabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                aria-controls={`settings-panel-${tab.id}`}
                aria-selected={isActive}
                className={`group flex min-w-0 items-center gap-3 border-r border-[var(--line)] px-4 py-3 text-left transition-[background,border,color] duration-[200ms] last:border-r-0 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--cyan)_inset] ${isActive ? "bg-[rgba(98,232,255,.09)] text-[var(--cyan)]" : "text-[var(--muted)] hover:bg-[rgba(255,255,255,.035)] hover:text-[var(--ink)]"}`}
                id={`settings-tab-${tab.id}`}
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                ref={(element) => {
                  tabButtonRefs.current[tab.id] = element;
                }}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                <Icon className="shrink-0" size={16} />
                <span className="min-w-0">
                  <strong className="block overflow-wrap-anywhere font-mono text-[9px] tracking-[.1em]">{tab.label}</strong>
                  <small className="mt-1 block overflow-wrap-anywhere text-[10px] leading-[1.35] text-current opacity-70">{tab.description}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div
          aria-labelledby={`settings-tab-${activeTab}`}
          className="min-w-0 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--cyan)_inset]"
          data-settings-tab-panel={activeTab}
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab === "details" ? <CampaignDetailsSettings campaignId={campaignId} initialCampaign={initialCampaign} /> : null}
          {activeTab === "visuals" ? <CampaignVisualStyles campaignId={campaignId} /> : null}
          {activeTab === "ai" ? (
            <div className="grid gap-5">
              <OpenRouterConnectionSettings campaignId={campaignId} />
              <CampaignAiSettings campaignId={campaignId} />
            </div>
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}