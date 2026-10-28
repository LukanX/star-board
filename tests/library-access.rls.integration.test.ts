import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCampaignLibraryAccess, readCampaignLibraryMembers } from "@/lib/references/library-access";
import { readSystemLibrary } from "@/lib/references/system-library";
import { referenceCatalogVersion } from "@/lib/references/catalog";
import { localLibrarySql, sqlLiteral } from "./support/local-library-sql";

const env = loadEnv("test", process.cwd(), "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const loopback = (() => { try { return new URL(url).hostname === "127.0.0.1"; } catch { return false; } })();
const enabled = process.env.RUN_LOCAL_SUPABASE_TESTS === "1" && loopback && Boolean(key);
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const referenceId = `sf2e.ancestries.Item.${suffix}`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const accounts = new Map<string, { id: string; client: SupabaseClient }>();
let service: SupabaseClient;
const campaigns = new Map<string, string>();
const account = (name: string) => {
  const result = accounts.get(name);
  if (!result) throw new Error("Missing campaign library fixture.");
  return result;
};
const campaign = (name: string) => {
  const result = campaigns.get(name);
  if (!result) throw new Error("Missing campaign library fixture.");
  return result;
};
const save = (actor: string, campaignId: string, revision: number, appearance: string) => account(actor).client.rpc("save_system_reference", {
  p_campaign_id: campaignId,
  p_reference_id: referenceId,
  p_expected_revision: revision,
  p_appearance: appearance,
  p_lore: "",
  p_trait_context: "",
  p_source_notes: "",
});
const grant = (actor: string, target: string, campaignName = "campaign-a", canEdit = true) =>
  account(actor).client.rpc("set_campaign_system_library_editor", {
    p_campaign_id: campaign(campaignName), p_user_id: account(target).id, p_can_edit: canEdit,
  });

describe.skipIf(!enabled)("local campaign-scoped System library access", () => {
  beforeAll(async () => {
    localLibrarySql("select 1;");
    const secret = process.env.TEST_LOCAL_SUPABASE_SERVICE_KEY;
    if (!secret) throw new Error("Local Auth fixture service key is required.");
    service = createClient(url, secret, options);
    for (const role of ["owner-a", "owner-b", "editor", "other-gm", "viewer", "outsider"]) {
      const email = `campaign-library-${suffix}-${role}@local.test`;
      const password = "local-campaign-library-fixture-password-2026";
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Could not create local campaign library fixture.");
      const client = createClient(url, key, options);
      if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error("Could not sign in local campaign library fixture.");
      accounts.set(role, { id: created.data.user.id, client });
    }
    for (const role of ["owner-a", "owner-b"]) {
      const result = await account(role).client.rpc("create_campaign", {
        campaign_name: `Campaign library ${role} ${suffix}`, campaign_description: "",
      });
      if (result.error || typeof result.data !== "string") throw new Error("Could not create a local campaign library fixture.");
      campaigns.set(role === "owner-a" ? "campaign-a" : "campaign-b", result.data);
    }
    localLibrarySql(`insert into public.campaign_members(campaign_id, user_id, role, display_name) values
      (${sqlLiteral(campaign("campaign-a"))}, ${sqlLiteral(account("editor").id)}, 'player', 'Member Editor'),
      (${sqlLiteral(campaign("campaign-a"))}, ${sqlLiteral(account("viewer").id)}, 'player', 'Member Viewer'),
      (${sqlLiteral(campaign("campaign-a"))}, ${sqlLiteral(account("other-gm").id)}, 'gm', 'Other Campaign GM');
      insert into public.system_reference_entries(reference_id, kind, name, catalog_version, source_url)
      values (${sqlLiteral(referenceId)}, 'ancestry', ${sqlLiteral(`Campaign reference ${suffix}`)}, ${sqlLiteral(referenceCatalogVersion)}, 'https://github.com/foundryvtt/pf2e/');`);
  }, 30000);

  afterAll(async () => {
    if (service) {
      for (const role of ["owner-a", "owner-b"]) {
        const campaignId = campaigns.get(role === "owner-a" ? "campaign-a" : "campaign-b");
        if (campaignId) {
          const removed = await account(role).client.from("campaigns").delete().eq("id", campaignId);
          if (removed.error) throw removed.error;
        }
      }
      localLibrarySql(`delete from public.system_reference_entries where reference_id = ${sqlLiteral(referenceId)};`);
      for (const { id } of accounts.values()) {
        const removed = await service.auth.admin.deleteUser(id);
        if (removed.error) throw removed.error;
      }
      await Promise.all([...accounts.values()].map(({ client }) => client.auth.signOut()));
    }
  });

  it("inherits editing only for the campaign creator and denies non-owner GMs", async () => {
    expect(await loadCampaignLibraryAccess(account("owner-a").client, campaign("campaign-a"))).toEqual({
      owner: true, member: true, canEdit: true,
    });
    expect(await loadCampaignLibraryAccess(account("other-gm").client, campaign("campaign-a"))).toEqual({
      owner: false, member: true, canEdit: false,
    });
    expect((await save("owner-a", campaign("campaign-a"), 0, "A-only owner appearance")).data).toBe(1);
    expect((await save("other-gm", campaign("campaign-a"), 0, "Denied")).error?.code).toBe("42501");
    expect((await account("other-gm").client.from("campaigns").update({ created_by: account("other-gm").id })
      .eq("id", campaign("campaign-a")).select("id")).error?.code).toBe("42501");
    expect((await account("other-gm").client.rpc("list_campaign_system_library_members", {
      p_campaign_id: campaign("campaign-a"),
    })).error?.code).toBe("42501");
    expect((await account("owner-a").client.from("campaign_system_library_editors").select("user_id")).error?.code).toBe("42501");
    expect((await account("owner-a").client.from("system_reference_revisions").select("revision")).error?.code).toBe("42501");
  });

  it("restricts assignment to members in this campaign and protects the inherited owner role", async () => {
    const listed = await readCampaignLibraryMembers(account("owner-a").client, campaign("campaign-a"), { q: "Member", limit: 50 });
    expect(listed.members.map((member) => member.userId).sort()).toEqual([account("editor").id, account("viewer").id].sort());
    expect((await grant("other-gm", "viewer")).error?.code).toBe("42501");
    expect((await grant("owner-a", "outsider")).error?.code).toBe("P0002");
    expect((await grant("owner-a", "owner-a")).error?.code).toBe("PT409");
    expect((await account("viewer").client.rpc("set_campaign_system_library_editor", {
      p_campaign_id: campaign("campaign-a"), p_user_id: account("viewer").id, p_can_edit: true,
    })).error?.code).toBe("42501");
    expect((await account("owner-a").client.from("campaign_system_library_editors").insert({
      campaign_id: campaign("campaign-a"), user_id: account("outsider").id,
    })).error?.code).toBe("42501");
    expect((await account("owner-a").client.rpc("list_campaign_system_library_members", {
      p_campaign_id: campaign("campaign-b"),
    })).error?.code).toBe("42501");
  });

  it("grants an existing member editing, preserves attribution, and isolates revisions between campaigns", async () => {
    const first = await grant("owner-a", "editor");
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ userId: account("editor").id, access: "editor", displayName: "Member Editor" });
    const timestamp = first.data.editorGrantedAt;
    expect((await grant("owner-a", "editor")).data.editorGrantedAt).toBe(timestamp);
    const grantor = localLibrarySql(`select granted_by::text from public.campaign_system_library_editors where campaign_id = ${sqlLiteral(campaign("campaign-a"))} and user_id = ${sqlLiteral(account("editor").id)};`);
    expect(grantor.trim()).toBe(account("owner-a").id);
    expect((await save("editor", campaign("campaign-a"), 1, "A-only editor appearance")).data).toBe(2);
    expect((await readSystemLibrary(account("owner-b").client, [referenceId], campaign("campaign-b")))[0]).toMatchObject({
      revision: 0, appearance: "",
    });
    expect((await save("owner-b", campaign("campaign-b"), 0, "B-only owner appearance")).data).toBe(1);
    const a = await readSystemLibrary(account("editor").client, [referenceId], campaign("campaign-a"));
    const b = await readSystemLibrary(account("owner-b").client, [referenceId], campaign("campaign-b"));
    expect(a[0]).toMatchObject({ revision: 2, appearance: "A-only editor appearance" });
    expect(b[0]).toMatchObject({ revision: 1, appearance: "B-only owner appearance" });
    expect((await save("editor", campaign("campaign-b"), 0, "Cross-campaign edit")).error?.code).toBe("42501");
    await expect(readSystemLibrary(account("outsider").client, [referenceId], campaign("campaign-a"))).rejects.toThrow("could not be loaded");
    expect((await account("editor").client.from("campaign_system_reference_revisions").select("revision")
      .eq("campaign_id", campaign("campaign-b"))).data).toEqual([]);
    expect((await readSystemLibrary(account("editor").client, [referenceId]))[0]).toMatchObject({
      revision: 0, appearance: "",
    });
  });

  it("serializes edits per campaign, enforces field bounds, and revokes without deleting content", async () => {
    const concurrent = await Promise.all([
      save("editor", campaign("campaign-a"), 2, "First concurrent edit"),
      save("editor", campaign("campaign-a"), 2, "Second concurrent edit"),
    ]);
    expect(concurrent.filter((result) => !result.error)).toHaveLength(1);
    expect(concurrent.find((result) => result.error)?.error?.code).toBe("PT409");
    const current = concurrent.some((result) => result.data === 3) ? 3 : 2;
    expect((await save("editor", campaign("campaign-a"), current, "x".repeat(4001))).error?.code).toBe("23514");
    expect((await account("owner-a").client.rpc("save_system_reference", {
      p_campaign_id: campaign("campaign-a"), p_reference_id: referenceId, p_expected_revision: current,
      p_appearance: "", p_lore: "", p_trait_context: "Wrong ancestry field", p_source_notes: "",
    })).error?.code).toBe("23514");
    expect((await grant("owner-a", "editor", "campaign-a", false)).data.access).toBe("read-only");
    expect((await save("editor", campaign("campaign-a"), current, "After revoke")).error?.code).toBe("42501");
    expect((await account("editor").client.from("campaign_system_reference_revisions").select("revision")
      .eq("campaign_id", campaign("campaign-a")).eq("reference_id", referenceId)).data).toHaveLength(current);
    localLibrarySql(`delete from public.campaign_members where campaign_id = ${sqlLiteral(campaign("campaign-a"))} and user_id = ${sqlLiteral(account("editor").id)};`);
    expect(await loadCampaignLibraryAccess(account("editor").client, campaign("campaign-a"))).toEqual({
      owner: false, member: false, canEdit: false,
    });
    expect(localLibrarySql(`select count(*) from public.campaign_system_library_editors where campaign_id = ${sqlLiteral(campaign("campaign-a"))} and user_id = ${sqlLiteral(account("editor").id)};`).trim()).toBe("0");
  });
});
