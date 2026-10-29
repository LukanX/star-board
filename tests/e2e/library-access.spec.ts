import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { getLocalE2eSupabaseConfig } from "./support/local-auth";
import { localLibrarySql, sqlLiteral } from "../support/local-library-sql";
import { referenceCatalogVersion } from "../../lib/references/catalog";

test("campaign owner manages member editing without crossing campaign boundaries", async ({ browser }) => {
  test.setTimeout(120000);
  const config = getLocalE2eSupabaseConfig();
  localLibrarySql("select 1;");
  const secret = process.env.TEST_LOCAL_SUPABASE_SERVICE_KEY;
  if (!secret) throw new Error("Local campaign library fixtures require TEST_LOCAL_SUPABASE_SERVICE_KEY.");
  const service = createClient(config.supabaseUrl, secret, { auth: { persistSession: false } });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const referenceId = `sf2e.ancestries.Item.${suffix}`;
  const password = "local-campaign-library-browser-password-2026";
  const roles = ["owner", "editor", "other-gm", "outsider"] as const;
  const emails = Object.fromEntries(roles.map((role) => [role, `campaign-access-${suffix}-${role}@local.test`]));
  const userIds = new Map<string, string>();
  const campaignIds = new Map<string, string>();
  const ownerClient = createClient(config.supabaseUrl, config.publishableKey, { auth: { persistSession: false } });
  const contexts = await Promise.all(roles.map(() => browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: { cookies: [], origins: [] },
  })));
  const [ownerPage, editorPage, gmPage, outsiderPage] = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of [ownerPage, editorPage, gmPage, outsiderPage]) page.setDefaultTimeout(15000);
  const campaignA = () => campaignIds.get("a")!;
  const campaignB = () => campaignIds.get("b")!;
  const signIn = async (page: typeof ownerPage, role: typeof roles[number], destination: string) => {
    await page.goto(destination);
    await expect(page).toHaveURL(/\/login\?mode=signin&next=/);
    const target = new URLSearchParams(new URL(page.url()).search).get("next");
    if (!target) throw new Error("Campaign library sign-in did not preserve its return URL.");
    const expectedUrl = new URL(destination, "http://127.0.0.1:3100");
    const returnUrl = new URL(target, "http://127.0.0.1:3100");
    expect(returnUrl.pathname).toBe(expectedUrl.pathname);
    for (const [key, value] of expectedUrl.searchParams) expect(returnUrl.searchParams.get(key)).toBe(value);
    await page.getByLabel("Email address").fill(emails[role]);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
  };
  try {
    for (const role of roles) {
      const created = await service.auth.admin.createUser({ email: emails[role], password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Could not create local campaign access account.");
      userIds.set(role, created.data.user.id);
    }
    if ((await ownerClient.auth.signInWithPassword({ email: emails.owner, password })).error) {
      throw new Error("Could not authenticate the local campaign owner fixture.");
    }
    for (const [name, suffixName] of [["a", "A"], ["b", "B"]] as const) {
      const created = await ownerClient.rpc("create_campaign", {
        campaign_name: `Campaign access ${suffixName} ${suffix}`, campaign_description: "",
      });
      if (created.error || typeof created.data !== "string") throw new Error("Could not create a local campaign access fixture.");
      campaignIds.set(name, created.data);
    }
    const editorId = userIds.get("editor")!;
    const otherGmId = userIds.get("other-gm")!;
    const outsiderId = userIds.get("outsider")!;
    localLibrarySql(`update public.campaign_members set display_name = ${sqlLiteral(`Owner-${suffix}`)}
      where campaign_id = ${sqlLiteral(campaignA())} and user_id = ${sqlLiteral(userIds.get("owner")!)};
      update public.campaign_members set display_name = ${sqlLiteral(`Owner-${suffix} B`)}
      where campaign_id = ${sqlLiteral(campaignB())} and user_id = ${sqlLiteral(userIds.get("owner")!)};
      insert into public.campaign_members(campaign_id, user_id, role, display_name) values
        (${sqlLiteral(campaignA())}, ${sqlLiteral(editorId)}, 'player', ${sqlLiteral(`Editor-${suffix}`)}),
        (${sqlLiteral(campaignA())}, ${sqlLiteral(otherGmId)}, 'gm', ${sqlLiteral(`GM-${suffix}`)});
      insert into public.system_reference_entries(reference_id, kind, name, catalog_version, source_url)
        values (${sqlLiteral(referenceId)}, 'ancestry', ${sqlLiteral(`Campaign access ${suffix}`)}, ${sqlLiteral(referenceCatalogVersion)}, 'https://github.com/foundryvtt/pf2e/');`);

    const detailA = `/campaigns/${campaignA()}/library/ancestries/${referenceId}`;
    const detailB = `/campaigns/${campaignB()}/library/ancestries/${referenceId}`;
    const accessA = `/campaigns/${campaignA()}/library/access?q=${suffix}&limit=1`;
    expect((await ownerPage.request.get(`/api/campaigns/${campaignA()}/system-library-access`)).status()).toBe(401);
    await signIn(editorPage, "editor", detailA);
    await expect(editorPage.getByText("ACCESS: READ-ONLY", { exact: true })).toBeVisible();
    await expect(editorPage.getByRole("alert").filter({ hasText: "Ask this campaign's owner" })).toHaveCount(0);
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveCount(0);

    await signIn(gmPage, "other-gm", detailA);
    await expect(gmPage.getByText("ACCESS: READ-ONLY", { exact: true })).toBeVisible();
    await expect(gmPage.getByRole("link", { name: "Library access", exact: true })).toHaveCount(0);
    await gmPage.goto(`/campaigns/${campaignA()}/library/access`);
    await expect(gmPage.getByRole("alert").filter({ hasText: "Only this campaign's owner" })).toBeVisible();
    expect((await gmPage.request.get(`/api/campaigns/${campaignA()}/system-library-access`)).status()).toBe(403);
    expect((await gmPage.request.put(`/api/campaigns/${campaignA()}/system-library-access/${editorId}`, { data: { canEdit: true } })).status()).toBe(403);

    await signIn(outsiderPage, "outsider", detailA);
    await expect(outsiderPage.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    expect((await outsiderPage.request.get(`/api/campaigns/${campaignA()}/system-library-access`)).status()).toBe(403);
    expect((await outsiderPage.request.put(`/api/campaigns/${campaignA()}/system-library-access/${editorId}`, { data: { canEdit: true } })).status()).toBe(403);

    await signIn(ownerPage, "owner", accessA);
    const ownerUrl = new URL(ownerPage.url());
    expect(ownerUrl.pathname).toBe(`/campaigns/${campaignA()}/library/access`);
    expect(ownerUrl.searchParams.has("campaign")).toBe(false);
    expect(ownerUrl.searchParams.get("q")).toBe(suffix);
    expect(ownerUrl.searchParams.get("limit")).toBe("1");
    await expect(ownerPage.getByText("ACCESS: OWNER", { exact: true })).toBeVisible();
    const editorRow = ownerPage.getByRole("article", { name: `Editor-${suffix} access`, exact: true });
    await expect(editorRow).toBeVisible();
    await expect(ownerPage.getByRole("link", { name: "Next page", exact: true })).toBeVisible();
    await ownerPage.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(ownerPage.getByRole("article", { name: `GM-${suffix} access`, exact: true })).toBeVisible();
    await ownerPage.goBack();
    await expect(ownerPage.getByRole("article", { name: `Editor-${suffix} access`, exact: true })).toBeVisible();
    await ownerPage.goForward();
    await expect(ownerPage.getByRole("article", { name: `GM-${suffix} access`, exact: true })).toBeVisible();
    await ownerPage.goto(`/campaigns/${campaignA()}/library/access?q=Editor-${suffix.toUpperCase()}`);
    await expect(ownerPage.getByRole("article", { name: `Editor-${suffix} access`, exact: true })).toBeVisible();
    expect(new URL(ownerPage.url()).pathname).toBe(`/campaigns/${campaignA()}/library/access`);

    const missingTarget = await ownerPage.request.put(`/api/campaigns/${campaignA()}/system-library-access/${outsiderId}`, { data: { canEdit: true } });
    expect(missingTarget.status()).toBe(404);
    const otherCampaignDirectory = await ownerPage.request.get(`/api/campaigns/${campaignB()}/system-library-access?q=Editor-${suffix}`);
    expect(await otherCampaignDirectory.json()).toEqual({ members: [], nextCursor: null });

    await ownerPage.goto(detailA);
    await expect(ownerPage.getByText("ACCESS: OWNER", { exact: true })).toBeVisible();
    await ownerPage.getByLabel(/^Appearance/).fill("Campaign A owner appearance.");
    await ownerPage.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(ownerPage.getByRole("status")).toContainText("Saved revision 1");
    await ownerPage.goto(detailB);
    await expect(ownerPage.getByText("No appearance entered in this campaign. No AI-written fallback.")).toBeVisible();
    await ownerPage.getByLabel(/^Appearance/).fill("Campaign B owner appearance.");
    await ownerPage.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(ownerPage.getByRole("status")).toContainText("Saved revision 1");
    await ownerPage.reload();
    await expect(ownerPage.getByLabel(/^Appearance/)).toHaveValue("Campaign B owner appearance.");
    await ownerPage.goto(detailA);
    await expect(ownerPage.getByLabel(/^Appearance/)).toHaveValue("Campaign A owner appearance.");
    expect((await ownerPage.request.get(`/api/campaigns/${campaignB()}/system-library-access?q=Editor-${suffix}`)).status()).toBe(200);

    await ownerPage.goto(`/system/access?campaign=${campaignA()}&q=Editor-${suffix}`);
    await expect(ownerPage).toHaveURL(`/campaigns/${campaignA()}/library/access?q=Editor-${suffix}`);
    const grantButton = ownerPage.getByRole("button", { name: "Grant editing", exact: true });
    let release: () => void = () => { throw new Error("Grant gate was not initialized."); };
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mutationUrl = `**/api/campaigns/${campaignA()}/system-library-access/${editorId}`;
    await ownerPage.route(mutationUrl, async (route) => { await gate; await route.continue(); });
    await grantButton.click();
    await expect(ownerPage.getByRole("button", { name: "UPDATING...", exact: true })).toBeDisabled();
    release();
    await expect(ownerPage.getByRole("button", { name: "Revoke editing", exact: true })).toBeVisible();
    await ownerPage.unroute(mutationUrl);
    await editorPage.reload();
    await expect(editorPage.getByText("ACCESS: EDITOR", { exact: true })).toBeVisible();
    await editorPage.getByLabel(/^Appearance/).fill("Campaign A member editor appearance.");
    await editorPage.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(editorPage.getByRole("status")).toContainText("Saved revision 2");
    await editorPage.goto(detailB);
    await expect(editorPage.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(editorPage.getByText("Campaign B owner appearance.")).toHaveCount(0);
    await editorPage.goto(detailA);
    await editorPage.reload();
    await editorPage.getByLabel(/^Appearance/).fill("Unsaved campaign edit should survive revocation.");
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveValue("Unsaved campaign edit should survive revocation.");

    ownerPage.once("dialog", (dialog) => dialog.dismiss());
    await ownerPage.getByRole("button", { name: "Revoke editing", exact: true }).click();
    await expect(ownerPage.getByRole("button", { name: "Revoke editing", exact: true })).toBeVisible();
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.getByRole("button", { name: "Revoke editing", exact: true }).click();
    await expect(ownerPage.getByRole("button", { name: "Grant editing", exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("status")).toContainText("Saved content is retained.");
    await editorPage.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(editorPage.getByRole("alert").filter({ hasText: "Campaign library editor access is required." })).toBeVisible();
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveValue("Unsaved campaign edit should survive revocation.");
    for (const width of [390, 1440]) {
      await ownerPage.setViewportSize({ width, height: 900 });
      expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    for (const [role, campaignId] of campaignIds) {
      const deleted = await ownerClient.from("campaigns").delete().eq("id", campaignId);
      if (deleted.error) throw deleted.error;
      if (role !== "a" && role !== "b") throw new Error("Unexpected campaign fixture.");
    }
    localLibrarySql(`delete from public.system_reference_entries where reference_id = ${sqlLiteral(referenceId)};`);
    for (const id of userIds.values()) {
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error) throw removed.error;
    }
  }
});
