"use client";

import CampaignAiSettings from "@/components/settings/CampaignAiSettings";
import CampaignVisualStyles from "@/components/settings/CampaignVisualStyles";
import OpenRouterConnectionSettings from "@/components/settings/OpenRouterConnectionSettings";
import PageLayout from "@/components/ui/PageLayout";

export default function SettingsRouteView({ campaignId }: { campaignId: string }) {
  return <PageLayout eyebrow="GAME MASTER CONTROL" title="Campaign settings" description="Shape which AI models are available when this campaign creates text drafts and visual art.">
    <div className="grid gap-5">
      <OpenRouterConnectionSettings campaignId={campaignId} />
      <CampaignAiSettings campaignId={campaignId} />
      <CampaignVisualStyles campaignId={campaignId} />
    </div>
  </PageLayout>;
}