import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import { recordActionButtonClassName, recordListClassName } from "@/components/ui/recordStyles";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { campaignLibraryPath } from "@/lib/campaign/routes";
import { readSystemLibrary } from "@/lib/references/system-library";

export default async function CampaignLibraryList({ params, searchParams }: {
  params: Promise<{ campaignId: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ campaignId, category }, query] = await Promise.all([params, searchParams]);
  const kind = category === "ancestries" ? "ancestry" : category === "creature-traits" ? "creature_trait" : null;
  if (!kind) notFound();
  const context = await getAuthenticatedUser();
  if (!context) notFound();
  const entries = (await readSystemLibrary(context.supabase, undefined, campaignId)).filter((entry) => entry.kind === kind);
  const q = typeof query.q === "string" ? query.q.slice(0, 160) : "";
  const visible = entries.filter((entry) => entry.name.toLowerCase().includes(q.toLowerCase()));
  const section = kind === "ancestry" ? "ancestries" : "creature-traits";

  return <PageLayout eyebrow="CAMPAIGN LIBRARY" title={kind === "ancestry" ? "Ancestries" : "Creature traits"}
    description={kind === "ancestry" ? "Browse ancestries and open an entry to view or edit this campaign's appearance and lore." : "Browse creature traits and open an entry to view or edit this campaign's generation guidance."}>
    <section className={recordListClassName} aria-label={kind === "ancestry" ? "Ancestry catalog" : "Creature trait catalog"}>
      <form action={campaignLibraryPath(campaignId, section)} method="get" role="search"
        className="flex min-w-0 flex-wrap items-end gap-3 border-b border-[var(--line)] p-[18px]">
        <label className="grid min-w-0 flex-1 gap-[6px] font-mono text-[9px] tracking-[.1em] text-[var(--dim)]">
          Name
          <input name="q" defaultValue={q} maxLength={160} placeholder={kind === "ancestry" ? "Search ancestries..." : "Search creature traits..."}
            className="h-[37px] min-w-0 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-[12px] tracking-normal text-[var(--ink)] placeholder:text-[var(--dim)] focus-visible:outline focus-visible:outline-[var(--cyan)]" />
        </label>
        <button className={`${recordActionButtonClassName} focus-visible:outline focus-visible:outline-[var(--cyan)]`} type="submit"><Search size={14} /> SEARCH</button>
      </form>
      <p className="m-0 border-b border-[var(--line)] px-[18px] py-3 font-mono text-[8px] tracking-[.08em] text-[var(--dim)]">{visible.length} of {entries.length} entries</p>
      {visible.length ? <ul className="m-0 grid list-none gap-px bg-[var(--line)] p-0 sm:grid-cols-2 xl:grid-cols-3" data-library-entries>
        {visible.map((entry) => <li key={entry.reference_id} className="min-w-0 bg-[var(--panel)]">
          <CampaignRouteLink href={campaignLibraryPath(campaignId, section, entry.reference_id)}
            className="flex h-full min-h-[49px] items-center px-[18px] py-3 text-[12px] text-[var(--ink)] transition-colors [overflow-wrap:anywhere] hover:bg-[rgba(98,232,255,.05)] hover:text-[var(--cyan)] focus-visible:outline focus-visible:outline-[var(--cyan)] focus-visible:-outline-offset-2">
            {entry.name}
          </CampaignRouteLink>
        </li>)}
      </ul> : <EmptyState title="No matching entries" message="Try a different name to search this catalog." />}
    </section>
  </PageLayout>;
}
