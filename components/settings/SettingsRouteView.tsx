"use client";

import CampaignAiSettings from "@/components/settings/CampaignAiSettings";
import PageLayout from "@/components/ui/PageLayout";

export default function SettingsRouteView({ campaignId }: { campaignId: string }) {
  return <PageLayout eyebrow="GAME MASTER CONTROL" title="Campaign settings" description="Shape which AI models are available when this campaign creates text drafts and visual art.">
    <CampaignAiSettings campaignId={campaignId} />
  </PageLayout>;
}