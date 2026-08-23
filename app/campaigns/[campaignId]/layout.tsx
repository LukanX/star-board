import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import CampaignRouteShell from "@/components/campaign-shell/CampaignRouteShell";
import { getCampaignRouteAccess } from "@/lib/campaign/server";
import { campaignPath, loginPath } from "@/lib/campaign/routes";

export default async function CampaignLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}>) {
  const { campaignId } = await params;
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(loginPath(campaignPath(campaignId)));
  }

  const access = await getCampaignRouteAccess(campaignId);

  if (!access) {
    notFound();
  }

  return <DirtyFormProvider><CampaignRouteShell campaignId={campaignId} campaignName={access.campaign.name} displayName={access.displayName} isGM={access.role === "gm"}>{children}</CampaignRouteShell></DirtyFormProvider>;
}