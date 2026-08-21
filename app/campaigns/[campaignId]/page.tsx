import CampaignCockpit from "@/components/campaign-cockpit/CampaignCockpit";

export default async function CampaignOverviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <CampaignCockpit initialCampaignId={campaignId} />;
}