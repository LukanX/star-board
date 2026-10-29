import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { campaignLibraryPath, campaignsPath } from "@/lib/campaign/routes";

export default async function SystemList({ params, searchParams }: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ category }, query] = await Promise.all([params, searchParams]);
  if (category !== "ancestries" && category !== "creature-traits") notFound();
  if (query.campaign === undefined) redirect(campaignsPath());
  const campaign = z.string().uuid().safeParse(query.campaign);
  if (!campaign.success) notFound();
  const search = typeof query.q === "string" ? `?${new URLSearchParams({ q: query.q.slice(0, 160) })}` : "";
  redirect(`${campaignLibraryPath(campaign.data, category)}${search}`);
}
