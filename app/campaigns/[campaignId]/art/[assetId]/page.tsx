import { notFound } from "next/navigation";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { listPublishedArt } from "@/lib/campaign/studio-server";
import ArtGallery from "@/components/ai-studio/ArtGallery";

export default async function ArtworkPage({ params }: { params: Promise<{ campaignId: string; assetId: string }> }) {
  const { campaignId, assetId } = await params;
  const context = await getAuthenticatedUser();
  if (!context || !await getCampaignMembership(context.supabase, campaignId, context.user.id)) notFound();
  const art = await listPublishedArt(context.supabase, campaignId, 0, assetId);
  if (!art.length) notFound();
  return <ArtGallery campaignId={campaignId} art={art} detail />;
}
