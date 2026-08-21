import { redirect } from "next/navigation";
import { campaignPath, campaignsPath } from "@/lib/campaign/routes";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ campaignId?: string | string[] | undefined }>;
}) {
  const { campaignId } = await searchParams;

  if (typeof campaignId === "string" && campaignId.length > 0) {
    redirect(campaignPath(campaignId));
  }

  redirect(campaignsPath());
}