import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { campaignLibraryPath, campaignsPath } from "@/lib/campaign/routes";

export default async function SystemDetail({ params, searchParams }: {
  params: Promise<{ category: string; referenceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ category, referenceId }, query] = await Promise.all([params, searchParams]);
  if (category !== "ancestries" && category !== "creature-traits") notFound();
  if (query.campaign === undefined) redirect(campaignsPath());
  const campaign = z.string().uuid().safeParse(query.campaign);
  if (!campaign.success) notFound();
  redirect(campaignLibraryPath(campaign.data, category, referenceId));
}
