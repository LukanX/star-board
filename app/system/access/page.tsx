import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { campaignLibraryPath, campaignsPath } from "@/lib/campaign/routes";

export default async function LibraryAccessPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (query.campaign === undefined) redirect(campaignsPath());
  const campaign = z.string().uuid().safeParse(query.campaign);
  if (!campaign.success) notFound();
  const preserved = new URLSearchParams();
  for (const key of ["q", "limit", "cursor"]) if (typeof query[key] === "string") preserved.set(key, query[key]);
  redirect(`${campaignLibraryPath(campaign.data, "access")}${preserved.size ? `?${preserved}` : ""}`);
}
