import CampaignOverview from "@/components/campaign-cockpit/CampaignOverview";
import { notFound } from "next/navigation";
import { getCampaignOverview } from "@/lib/campaign/server";

export default async function CampaignOverviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const overview = await getCampaignOverview(campaignId);

  if (!overview) notFound();

  return <CampaignOverview campaignId={campaignId} overview={overview} />;
}