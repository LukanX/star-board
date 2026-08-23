import { notFound } from "next/navigation";
import SettingsRouteView from "@/components/settings/SettingsRouteView";
import { getCampaignSettings } from "@/lib/campaign/settings-server";

export default async function SettingsPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignSettings(campaignId);

  if (!result) notFound();

  return <SettingsRouteView campaignId={campaignId} />;
}