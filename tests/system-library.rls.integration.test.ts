import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";
import { creatureTraitVersion, readSystemLibrary } from "@/lib/references/system-library";
import { referenceCatalogVersion } from "@/lib/references/catalog";
import { localLibrarySql, sqlLiteral } from "./support/local-library-sql";

const env = loadEnv("test", process.cwd(), "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const loopback = (() => { try { return new URL(url).hostname === "127.0.0.1"; } catch { return false; } })();
const enabled = process.env.RUN_LOCAL_SUPABASE_TESTS === "1" && loopback && Boolean(key);
const id = randomUUID().replaceAll("-", "").slice(0, 16);
const referenceId = `sf2e.ancestries.Item.${id}`;
const password = "local-system-reference-test-password-2026";
const users = new Set<string>();
let admin: SupabaseClient;
let gm: SupabaseClient;
let editor: SupabaseClient;
let outsider: SupabaseClient;
let campaignId: string;
let gmId: string;
let editorId: string;
let outsiderId: string;
let enemyId: string;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const save = (client: SupabaseClient, campaignId: string, revision: number, appearance = "Local test appearance") => client.rpc("save_system_reference", {
  p_campaign_id: campaignId, p_reference_id: referenceId, p_expected_revision: revision,
  p_appearance: appearance, p_lore: "", p_trait_context: "", p_source_notes: "",
});

describe.skipIf(!enabled)("local campaign System library integrity", () => {
  beforeAll(async () => {
    const serviceKey = process.env.TEST_LOCAL_SUPABASE_SERVICE_KEY;
    if (!serviceKey) throw new Error("Set TEST_LOCAL_SUPABASE_SERVICE_KEY from the confirmed loopback Supabase CLI status for privileged local fixtures.");
    localLibrarySql("select 1;");
    admin = createClient(url, serviceKey, options);
    const createUser = async (role: string) => {
      const email = `system-library-${role}-${id}@local.test`;
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error || !result.data.user) throw new Error(`Local fixture user creation failed: ${result.error?.message}`);
      users.add(result.data.user.id);
      const client = createClient(url, key, options);
      const session = await client.auth.signInWithPassword({ email, password });
      if (session.error) throw new Error("Local fixture sign-in failed.");
      return { client, id: result.data.user.id };
    };
    const g = await createUser("gm"); gm = g.client; gmId = g.id;
    const e = await createUser("editor"); editor = e.client; editorId = e.id;
    const o = await createUser("outsider"); outsider = o.client; outsiderId = o.id;
    const campaign = await gm.rpc("create_campaign", { campaign_name: `System library RLS ${id}`, campaign_description: "Local integration fixture" });
    if (campaign.error || !campaign.data) throw new Error("Local fixture campaign creation failed.");
    campaignId = campaign.data;
    localLibrarySql(`insert into public.campaign_members(campaign_id, user_id, role, display_name) values
      (${sqlLiteral(campaignId)}, ${sqlLiteral(editorId)}, 'player', 'Local library editor');
      insert into public.system_reference_entries(reference_id, kind, name, catalog_version, source_url)
      values (${sqlLiteral(referenceId)}, 'ancestry', ${sqlLiteral(`Local reference ${id}`)}, ${sqlLiteral(referenceCatalogVersion)}, 'https://github.com/foundryvtt/pf2e/');
      insert into public.campaign_system_library_editors(campaign_id, user_id, granted_by)
      values (${sqlLiteral(campaignId)}, ${sqlLiteral(editorId)}, ${sqlLiteral(gmId)});`);
  }, 30000);
  afterAll(async () => {
    if (!admin) return;
    if (campaignId) {
      const result = await gm.from("campaigns").delete().eq("id", campaignId);
      if (result.error) throw result.error;
    }
    localLibrarySql(`delete from public.system_reference_entries where reference_id = ${sqlLiteral(referenceId)};`);
    for (const user of users) {
      const result = await admin.auth.admin.deleteUser(user);
      if (result.error) throw result.error;
    }
    await Promise.all([gm?.auth.signOut(), editor?.auth.signOut(), outsider?.auth.signOut()]);
  });
  it("keeps the catalog global while authored content and editing require campaign access", async () => {
    const anonymous = createClient(url, key, options);
    expect((await anonymous.from("system_reference_entries").select("reference_id")).error).not.toBeNull();
    expect((await anonymous.rpc("read_system_references")).error).not.toBeNull();
    expect((await readSystemLibrary(outsider, [referenceId]))[0]).toMatchObject({ revision: 0, appearance: "", lore: "" });
    expect((await save(gm, campaignId, 0)).data).toBe(1);
    expect((await save(outsider, campaignId, 1)).error?.code).toBe("42501");
    expect((await editor.from("system_reference_entries").update({ name: "Forbidden" }).eq("reference_id", referenceId)).error?.code).toBe("42501");
    expect((await editor.from("campaign_system_reference_revisions").insert({
      campaign_id: campaignId, reference_id: referenceId, kind: "ancestry", revision: 1,
    })).error?.code).toBe("42501");
  });
  it("serializes concurrent saves and retains immutable history", async () => {
    expect((await save(editor, campaignId, 1)).data).toBe(2);
    const concurrent = await Promise.all([
      save(editor, campaignId, 2, "First contender"), save(editor, campaignId, 2, "Second contender"),
    ]);
    expect(concurrent.filter((result) => !result.error)).toHaveLength(1);
    expect(concurrent.find((result) => result.error)?.error?.code).toBe("PT409");
    const history = await gm.from("campaign_system_reference_revisions").select("revision")
      .eq("campaign_id", campaignId).eq("reference_id", referenceId).order("revision");
    expect(history.data).toEqual([{ revision: 1 }, { revision: 2 }, { revision: 3 }]);
    expect((await editor.from("campaign_system_reference_revisions").delete()
      .eq("campaign_id", campaignId).eq("reference_id", referenceId)).error?.code).toBe("42501");
  });
  it("enforces field bounds and kind constraints inside the database", async () => {
    expect((await save(editor, campaignId, 3, "x".repeat(4001))).error?.code).toBe("23514");
    const wrongKind = await editor.rpc("save_system_reference", {
      p_campaign_id: campaignId, p_reference_id: referenceId, p_expected_revision: 3,
      p_appearance: "", p_lore: "", p_trait_context: "Wrong ancestry field", p_source_notes: "",
    });
    expect(wrongKind.error?.code).toBe("23514");
  });
  it("makes revocation effective for an already authenticated editor", async () => {
    localLibrarySql(`delete from public.campaign_system_library_editors where campaign_id = ${sqlLiteral(campaignId)} and user_id = ${sqlLiteral(editorId)};`);
    expect((await save(editor, campaignId, 3)).error?.code).toBe("42501");
    expect((await editor.from("campaign_system_library_editors").insert({ campaign_id: campaignId, user_id: editorId })).error?.code).toBe("42501");
    expect((await editor.from("campaigns").select("id").eq("id", campaignId)).data).toHaveLength(1);
  });
  it("keeps campaign switches scoped to campaign GMs", async () => {
    const saved = await gm.from("campaign_system_reference_settings").insert({ campaign_id: campaignId, updated_by: gmId }).select("appearance, lore, creature_traits").single();
    expect(saved.error).toBeNull(); expect(saved.data).toEqual({ appearance: false, lore: false, creature_traits: false });
    localLibrarySql(`insert into public.campaign_members(campaign_id, user_id, role, display_name) values (${sqlLiteral(campaignId)}, ${sqlLiteral(outsiderId)}, 'player', 'Local library player');`);
    expect((await outsider.from("campaign_system_reference_settings").select("campaign_id")).data).toHaveLength(1);
    const denied = await outsider.from("campaign_system_reference_settings").update({ appearance: true, updated_by: outsiderId }).eq("campaign_id", campaignId).select();
    expect(denied.data).toEqual([]);
    expect((await gm.from("campaign_system_reference_settings").select("appearance").eq("campaign_id", campaignId).single()).data?.appearance).toBe(false);
  });
  it("persists private enemy bindings transactionally and reconciles removed traits", async () => {
    const references = { ancestry: { id: referenceId, catalogVersion: referenceCatalogVersion }, creatureTraits: [{ id: "sf2e.creature-traits.undead", catalogVersion: creatureTraitVersion }] };
    const created = await gm.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId, p_public: { name: `Reference enemy ${id}`, playerDescription: "", isRevealed: false },
      p_details: { level: 0, size: "medium", rarity: "common", traits: ["Undead", "Custom"], family: null, origin: "manual", statBlock: enemyStatBlockSchema.parse({ schemaVersion: 1 }), systemReferences: references },
    });
    expect(created.error).toBeNull(); enemyId = created.data;
    expect((await gm.from("enemy_reference_selections").select("reference_id").eq("enemy_id", enemyId)).data).toHaveLength(2);
    expect((await outsider.from("enemy_reference_selections").select("reference_id").eq("enemy_id", enemyId)).data).toEqual([]);
    const before = await gm.from("enemies").select("updated_at").eq("id", enemyId).single();
    expect((await gm.rpc("replace_enemy_reference_selections", { p_enemy_id: enemyId, p_references: references })).error).toBeNull();
    const after = await gm.from("enemies").select("updated_at").eq("id", enemyId).single();
    expect(after.data?.updated_at).not.toBe(before.data?.updated_at);
    expect((await gm.rpc("replace_enemy_reference_selections", { p_enemy_id: enemyId, p_references: { ancestry: { ...references.ancestry, catalogVersion: "stale" }, creatureTraits: [] } })).error?.code).toBe("PT409");
    expect((await outsider.rpc("replace_enemy_reference_selections", { p_enemy_id: enemyId, p_references: references })).error?.code).toBe("42501");
    expect((await gm.rpc("replace_enemy_reference_selections", { p_enemy_id: enemyId, p_references: { ...references, creatureTraits: Array.from({ length: 33 }, () => references.creatureTraits[0]) } })).error?.code).toBe("22023");
    const changed = await gm.from("enemy_details").update({ traits: ["Custom"] }).eq("enemy_id", enemyId);
    expect(changed.error).toBeNull();
    expect((await gm.from("enemy_reference_selections").select("kind").eq("enemy_id", enemyId)).data).toEqual([{ kind: "ancestry" }]);
    expect((await gm.rpc("replace_enemy_reference_selections", { p_enemy_id: enemyId, p_references: references })).error?.code).toBe("22023");
    expect((await gm.from("enemy_reference_selections").select("kind").eq("enemy_id", enemyId)).data).toEqual([{ kind: "ancestry" }]);
  });
  it("enforces source count and exact serialized JSONB byte limits", async () => {
    const run = { campaign_id: campaignId, requested_by: gmId, kind: "enemy", mode: "create", model: "local/test", prompt_hash: "a".repeat(64), status: "complete" };
    const insert = (sources: unknown) => gm.from("ai_generation_runs").insert({ ...run, reference_sources: sources });
    expect((await insert(Array.from({ length: 34 }, () => ({})))).error).toBeNull();
    expect((await insert(Array.from({ length: 35 }, () => ({})))).error?.code).toBe("23514");
    expect((await insert(["x".repeat(65532)])).error).toBeNull();
    expect((await insert(["x".repeat(65533)])).error?.code).toBe("23514");
    expect((await insert(["\u00e9".repeat(32767)])).error?.code).toBe("23514");
  });
  it("retains shared revisions when the author account is removed", async () => {
    const removed = await admin.auth.admin.deleteUser(editorId);
    expect(removed.error).toBeNull(); users.delete(editorId);
    const revisions = await gm.from("campaign_system_reference_revisions").select("revision, authored_by")
      .eq("campaign_id", campaignId).eq("reference_id", referenceId).order("revision");
    expect(revisions.data).toEqual([
      { revision: 1, authored_by: gmId },
      { revision: 2, authored_by: null },
      { revision: 3, authored_by: null },
    ]);
  });
});
