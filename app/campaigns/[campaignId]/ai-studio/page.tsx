import { notFound } from "next/navigation";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { listStudioAssets } from "@/lib/campaign/studio-server";
import CampaignStudio from "@/components/ai-studio/CampaignStudio";

export default async function StudioPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const context = await requireCampaignGM(campaignId);
  if (!context) notFound();
  return <CampaignStudio campaignId={campaignId} userId={context.user.id} initialAssets={await listStudioAssets(context.supabase, campaignId)} />;
}
