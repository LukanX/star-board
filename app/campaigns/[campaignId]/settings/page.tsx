import { notFound } from "next/navigation";
import SettingsRouteView from "@/components/settings/SettingsRouteView";
import { getCampaignSettings } from "@/lib/campaign/settings-server";
import { normalizeOpenRouterCallbackOutcome } from "@/components/settings/openRouterOutcome";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ campaignId }, query] = await Promise.all([params, searchParams]);
  const result = await getCampaignSettings(campaignId);

  if (!result) notFound();

  return <SettingsRouteView
    campaignId={campaignId}
    initialCampaign={result.campaign}
    initialNarrativeSettings={result.narrativeSettings}
    initialOpenRouterOutcome={normalizeOpenRouterCallbackOutcome(query)}
  />;
}