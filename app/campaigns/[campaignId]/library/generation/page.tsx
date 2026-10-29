import { notFound } from "next/navigation";
import CampaignSystemReferences from "@/components/system/CampaignSystemReferences";
import PageLayout from "@/components/ui/PageLayout";
import { getCampaignRouteAccess } from "@/lib/campaign/server";

export default async function CampaignLibraryGenerationPage({ params }: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const access = await getCampaignRouteAccess(campaignId);
  if (!access) notFound();

  return <PageLayout eyebrow="CAMPAIGN LIBRARY // GM CONTROL" title="Generation context"
    description="Choose which library content can help ground AI generation in this campaign.">
    {access.role === "gm" ? <CampaignSystemReferences campaignId={campaignId} />
      : <p role="alert" className="text-[11px] text-[var(--amber)]">Only campaign GMs can change generation context settings.</p>}
  </PageLayout>;
}
