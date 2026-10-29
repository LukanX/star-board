import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { campaignLibraryPath, campaignsPath } from "@/lib/campaign/routes";

export default async function SystemPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (query.campaign === undefined) redirect(campaignsPath());
  const campaign = z.string().uuid().safeParse(query.campaign);
  if (!campaign.success) notFound();
  redirect(campaignLibraryPath(campaign.data));
}
