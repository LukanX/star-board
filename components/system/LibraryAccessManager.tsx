"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { panelClassName, recordActionButtonClassName } from "@/components/ui/recordStyles";
import { campaignLibraryPath } from "@/lib/campaign/routes";
import {
  campaignLibraryEditorResponseSchema,
  type CampaignLibraryDirectoryPage,
  type CampaignLibraryDirectoryQuery,
  type CampaignLibraryMember,
} from "@/lib/validation/library-access";

const accessLabels = { owner: "Owner", editor: "Editor", "read-only": "Read-only" };
type ActionState = { pending: boolean; message?: string; error?: string };

export default function LibraryAccessManager({ page, query, campaign }: {
  page: CampaignLibraryDirectoryPage; query: CampaignLibraryDirectoryQuery; campaign: string;
}) {
  const router = useRouter();
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const active = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const controllers = active.current;
    return () => { for (const controller of controllers.values()) controller.abort(); };
  }, []);
  function pageHref(cursor: CampaignLibraryDirectoryPage["nextCursor"]) {
    const params = new URLSearchParams({ q: query.q, limit: String(query.limit) });
    if (cursor) params.set("cursor", JSON.stringify(cursor));
    return `${campaignLibraryPath(campaign, "access")}?${params}`;
  }
  async function changeAccess(member: CampaignLibraryMember) {
    if (active.current.has(member.userId) || member.access === "owner") return;
    const canEdit = member.access === "read-only";
    if (!canEdit && !window.confirm(`Revoke System library editing for ${member.displayName} in this campaign? Saved reference content will be retained.`)) return;
    const controller = new AbortController();
    active.current.set(member.userId, controller);
    setActions((current) => ({ ...current, [member.userId]: { pending: true } }));
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign)}/system-library-access/${encodeURIComponent(member.userId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canEdit }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Campaign editing access could not be updated.");
      const saved = campaignLibraryEditorResponseSchema.parse(result).member;
      if (saved.userId !== member.userId || saved.access !== (canEdit ? "editor" : "read-only")) {
        throw new Error("Campaign editor response does not match this change.");
      }
      if (!controller.signal.aborted) {
        setActions((current) => ({
          ...current,
          [member.userId]: {
            pending: false,
            message: canEdit ? "Editing access granted for this campaign." : "Editing access revoked. Saved content is retained.",
          },
        }));
        router.refresh();
      }
    } catch (error) {
      if (!controller.signal.aborted) setActions((current) => ({
        ...current,
        [member.userId]: { pending: false, error: error instanceof Error ? error.message : "Campaign editing access could not be updated." },
      }));
    } finally {
      active.current.delete(member.userId);
    }
  }
  return <section className="grid min-w-0 gap-5" aria-label="Campaign member directory">
    <p className="m-0 max-w-3xl text-[11px] leading-relaxed text-[var(--muted)]">Owner editing access is automatic. Grant editing to current members below; their access and authored content stay in this campaign. Removing a member also removes their editor grant.</p>
    <form action={campaignLibraryPath(campaign, "access")} method="get" role="search" className={`${panelClassName} flex min-w-0 flex-wrap items-end gap-3 p-[18px]`}>
      <input type="hidden" name="limit" value={query.limit} />
      <label className="grid min-w-0 flex-1 gap-[6px] font-mono text-[9px] tracking-[.1em] text-[var(--dim)]">Campaign member name<input name="q" defaultValue={query.q} maxLength={160} className="h-[37px] min-w-0 w-full border border-[var(--line)] bg-[var(--background)] px-3 text-[12px] tracking-normal text-[var(--ink)] focus-visible:outline focus-visible:outline-[var(--cyan)]" /></label>
      <button className={`${recordActionButtonClassName} focus-visible:outline focus-visible:outline-[var(--cyan)]`} type="submit">SEARCH MEMBERS</button>
    </form>
    {!page.members.length ? <p role="status" className="text-sm text-[var(--muted)]">No campaign members match this search.</p> : <ul className="m-0 grid list-none gap-3 p-0">{page.members.map((member) => {
      const action = actions[member.userId];
      return <li key={member.userId}><article aria-label={`${member.displayName} access`} className={`${panelClassName} grid min-w-0 gap-4 p-[18px_21px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
        <div className="min-w-0 [overflow-wrap:anywhere]"><h2 className="m-0 text-[13px]">{member.displayName}</h2><p className="mb-0 font-mono text-[8px] tracking-[.1em] text-[var(--dim)]">CAMPAIGN ROLE: {member.campaignRole.toUpperCase()}</p></div>
        <div className="grid min-w-0 gap-2 text-[11px] [overflow-wrap:anywhere]"><p className="m-0">Access: <strong className="text-[var(--cyan)]">{accessLabels[member.access]}</strong></p>
          {member.access === "owner" ? <p className="m-0 text-xs text-[var(--muted)]">Owner editing access is automatic and cannot be changed here.</p>
            : <><p className="m-0 text-xs text-[var(--muted)]">{member.editorGrantedAt ? `Editor since ${new Date(member.editorGrantedAt).toISOString().slice(0, 10)}` : "Can browse this campaign's references, but cannot edit them."}</p>
              <button type="button" disabled={action?.pending} onClick={() => void changeAccess(member)}
                className={`${recordActionButtonClassName} justify-self-start focus-visible:outline focus-visible:outline-[var(--cyan)]`}>
                {action?.pending ? "UPDATING..." : member.access === "editor" ? "Revoke editing" : "Grant editing"}
              </button></>}
          {action?.error ? <p role="alert" className="m-0 text-xs text-[var(--pink)]">{action.error}</p> : null}
          {action?.message ? <p role="status" className="m-0 text-xs text-[var(--green)]">{action.message}</p> : null}
        </div>
      </article></li>;
    })}</ul>}
    <nav aria-label="Directory pages" className="flex flex-wrap gap-5 font-mono text-xs text-[var(--cyan)]">
      {query.cursor ? <CampaignRouteLink className="underline" href={pageHref(null)}>First page</CampaignRouteLink> : null}
      {page.nextCursor ? <CampaignRouteLink className="underline" href={pageHref(page.nextCursor)}>Next page</CampaignRouteLink> : null}
    </nav>
  </section>;
}
