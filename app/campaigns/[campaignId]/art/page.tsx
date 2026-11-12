import { notFound } from "next/navigation";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { listPublishedArt } from "@/lib/campaign/studio-server";
import ArtGallery from "@/components/ai-studio/ArtGallery";

export default async function ArtPage({ params, searchParams }: {
  params: Promise<{ campaignId: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const { campaignId } = await params;
  const context = await getAuthenticatedUser();
  if (!context || !await getCampaignMembership(context.supabase, campaignId, context.user.id)) notFound();
  const rawPage = Number((await searchParams).page ?? 0);
  if (!Number.isSafeInteger(rawPage) || rawPage < 0 || rawPage > 4000) notFound();
  return <ArtGallery campaignId={campaignId} page={rawPage} art={await listPublishedArt(context.supabase, campaignId, rawPage * 24)} />;
}
