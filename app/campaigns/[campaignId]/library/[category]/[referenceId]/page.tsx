import { notFound } from "next/navigation";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import SystemLibraryEditor from "@/components/system/SystemLibraryEditor";
import PageLayout from "@/components/ui/PageLayout";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { campaignLibraryPath } from "@/lib/campaign/routes";
import { loadCampaignLibraryAccess } from "@/lib/references/library-access";
import { readSystemLibrary } from "@/lib/references/system-library";

export default async function CampaignLibraryDetail({ params }: {
  params: Promise<{ campaignId: string; category: string; referenceId: string }>;
}) {
  const { campaignId, category, referenceId } = await params;
  const kind = category === "ancestries" ? "ancestry" : category === "creature-traits" ? "creature_trait" : null;
  if (!kind) notFound();
  const context = await getAuthenticatedUser();
  if (!context) notFound();
  const [entries, access] = await Promise.all([
    readSystemLibrary(context.supabase, [referenceId], campaignId),
    loadCampaignLibraryAccess(context.supabase, campaignId),
  ]);
  const [entry] = entries;
  if (!entry || entry.kind !== kind) notFound();

  return <PageLayout eyebrow="CAMPAIGN LIBRARY" title={entry.name}
    description={kind === "ancestry" ? "Appearance and lore for this campaign's characters and encounters." : "Creature-trait guidance for this campaign's encounters."}>
    <CampaignRouteLink href={campaignLibraryPath(campaignId, kind === "ancestry" ? "ancestries" : "creature-traits")}
      className="mb-5 inline-block font-mono text-[9px] tracking-[.08em] text-[var(--cyan)] hover:underline focus-visible:outline focus-visible:outline-[var(--cyan)]">
      {kind === "ancestry" ? "Back to ancestries" : "Back to creature traits"}
    </CampaignRouteLink>
    <SystemLibraryEditor key={`${campaignId}:${entry.reference_id}`} entry={entry} editable={access.canEdit}
      campaignId={campaignId} contentVisible />
    <details className="mt-5 min-w-0 border border-[var(--line)] px-5 py-4 text-[11px] text-[var(--muted)] [overflow-wrap:anywhere]">
      <summary className="cursor-pointer font-mono text-[9px] tracking-[.08em] focus-visible:outline focus-visible:outline-[var(--cyan)]">IMPORTED REFERENCE SOURCE</summary>
      {entry.publication ? <p>{entry.publication}</p> : null}
      <p>{entry.reference_id} · {entry.catalog_version}</p>
      <p className="mb-0"><a className="text-[var(--cyan)] underline" href={entry.source_url} target="_blank" rel="noreferrer">Foundry metadata source</a> · Authored content is entered separately, not sourced from this link.</p>
    </details>
  </PageLayout>;
}
