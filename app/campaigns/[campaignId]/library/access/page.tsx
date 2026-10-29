import { notFound } from "next/navigation";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import LibraryAccessManager from "@/components/system/LibraryAccessManager";
import PageLayout from "@/components/ui/PageLayout";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { campaignLibraryPath } from "@/lib/campaign/routes";
import { loadCampaignLibraryAccess, readCampaignLibraryMembers } from "@/lib/references/library-access";
import { campaignLibraryDirectoryQuerySchema } from "@/lib/validation/library-access";

export default async function CampaignLibraryAccessPage({ params, searchParams }: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ campaignId }, query] = await Promise.all([params, searchParams]);
  const context = await getAuthenticatedUser();
  if (!context) notFound();
  const access = await loadCampaignLibraryAccess(context.supabase, campaignId);
  const input = campaignLibraryDirectoryQuerySchema.safeParse({ q: query.q, limit: query.limit, cursor: query.cursor });

  return <PageLayout eyebrow="CAMPAIGN LIBRARY // OWNER CONTROL" title="Library access"
    description="Assign library editors from this campaign's current members.">
    {!access.owner ? <p role="alert" className="text-[11px] text-[var(--amber)]">Only this campaign&apos;s owner can manage System library editors.</p>
      : !input.success ? <p role="alert" className="text-[11px] text-[var(--pink)]">Directory query is invalid. <CampaignRouteLink className="text-[var(--cyan)] underline" href={campaignLibraryPath(campaignId, "access")}>Reset search</CampaignRouteLink></p>
        : <LibraryAccessManager key={`${campaignId}:${JSON.stringify(input.data)}`} campaign={campaignId} query={input.data}
          page={await readCampaignLibraryMembers(context.supabase, campaignId, input.data)} />}
  </PageLayout>;
}
