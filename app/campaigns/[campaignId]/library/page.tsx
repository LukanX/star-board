import { redirect } from "next/navigation";
import { campaignLibraryPath } from "@/lib/campaign/routes";

export default async function CampaignLibraryPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  redirect(campaignLibraryPath(campaignId));
}
