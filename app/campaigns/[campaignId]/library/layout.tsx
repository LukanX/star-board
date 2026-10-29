import { notFound } from "next/navigation";
import SystemNavigation from "@/components/system/SystemNavigation";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { getCampaignRouteAccess } from "@/lib/campaign/server";
import { loadCampaignLibraryAccess } from "@/lib/references/library-access";

export default async function CampaignLibraryLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const [context, campaign] = await Promise.all([getAuthenticatedUser(), getCampaignRouteAccess(campaignId)]);
  if (!context || !campaign) notFound();
  const access = await loadCampaignLibraryAccess(context.supabase, campaignId);

  return <><SystemNavigation campaignId={campaignId} access={access} isGM={campaign.role === "gm"} />{children}</>;
}
