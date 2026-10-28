import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { getLocalE2eSupabaseConfig } from "./support/local-auth";
import { localLibrarySql, sqlLiteral } from "../support/local-library-sql";
import { referenceCatalogVersion, searchReferences } from "../../lib/references/catalog";
import { enemyStatBlockSchema } from "../../lib/validation/enemy";

test("campaign owner and assigned editor share campaign-specific revisions", async ({ browser, page, campaign }) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  const config = getLocalE2eSupabaseConfig();
  const secret = process.env.TEST_LOCAL_SUPABASE_SERVICE_KEY;
  if (!secret) throw new Error("Local System library browser fixtures require TEST_LOCAL_SUPABASE_SERVICE_KEY.");
  localLibrarySql("select 1;");
  const admin = createClient(config.supabaseUrl, secret, { auth: { persistSession: false } });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const referenceId = `sf2e.ancestries.Item.${suffix}`;
  const email = `system-library-editor-e2e-${suffix}@local.test`;
  const password = "local-library-editor-test-password-2026";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create local library editor fixture.");
  const userId = created.data.user.id;
  const editorContext = await browser.newContext({ baseURL: "http://127.0.0.1:3100", storageState: { cookies: [], origins: [] } });
  const editorPage = await editorContext.newPage();
  editorPage.setDefaultTimeout(15000);
  const libraryPath = `/campaigns/${campaign.campaignId}/library`;
  const detailPath = `${libraryPath}/ancestries/${referenceId}`;
  const detail = detailPath;
  try {
    localLibrarySql(`insert into public.campaign_members(campaign_id, user_id, role, display_name)
      values (${sqlLiteral(campaign.campaignId)}, ${sqlLiteral(userId)}, 'player', ${sqlLiteral(`Library editor ${suffix}`)});
      insert into public.campaign_system_library_editors(campaign_id, user_id)
      values (${sqlLiteral(campaign.campaignId)}, ${sqlLiteral(userId)});
      insert into public.system_reference_entries(reference_id, kind, name, catalog_version, source_url)
      values (${sqlLiteral(referenceId)}, 'ancestry', ${sqlLiteral(`Manual library fixture ${suffix}`)}, ${sqlLiteral(referenceCatalogVersion)}, 'https://github.com/foundryvtt/pf2e/');`);
    await page.goto(`/campaigns/${campaign.campaignId}`);
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page).toHaveURL(`${libraryPath}/ancestries`);
    await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);
    await expect(page.locator("[data-campaign-sidebar]")).toHaveCount(1);
    await expect(page.locator("[data-campaign-topbar]")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Library", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("Coverage", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-library-entries] li").first()).not.toContainText("Appearance:");
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}$`));
    await page.goto(detail);
    await expect(page.getByText("ACCESS: OWNER", { exact: true })).toBeVisible();
    await page.getByLabel(/^Appearance/).fill("Campaign owner appearance.");
    await page.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved revision 1");

    await editorPage.goto(detail);
    await expect(editorPage).toHaveURL(new RegExp(`/login\\?mode=signin&next=${encodeURIComponent(detail)}$`));
    await editorPage.getByLabel("Email address").fill(email);
    await editorPage.getByLabel("Password").fill(password);
    await editorPage.getByRole("button", { name: "SIGN IN", exact: true }).click();
    await expect(editorPage).toHaveURL(detailPath);
    await editorPage.reload();
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveValue("Campaign owner appearance.");
    const appearanceField = editorPage.getByLabel(/^Appearance/);
    await appearanceField.fill("Local fixture appearance with distinctive appendages.");
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveValue("Local fixture appearance with distinctive appendages.");
    await editorPage.getByLabel(/^Additional lore/).fill("Local fixture travel lore.");
    await editorPage.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(editorPage.getByRole("status")).toContainText("Saved revision 2");
    expect(localLibrarySql(`select appearance from public.campaign_system_reference_revisions where campaign_id = ${sqlLiteral(campaign.campaignId)} and reference_id = ${sqlLiteral(referenceId)} order by revision desc limit 1;`).trim())
      .toBe("Local fixture appearance with distinctive appendages.");
    await page.reload();
    await expect(page.getByLabel(/^Appearance/)).toHaveValue("Local fixture appearance with distinctive appendages.");
    await expect(page.locator("form p").filter({ hasText: "Local fixture appearance with distinctive appendages." })).toBeVisible();
    const conflict = await editorPage.request.put(`/api/campaigns/${campaign.campaignId}/system-references/${referenceId}`, { data: { expectedRevision: 1, appearance: "Stale edit", lore: "", traitContext: "", sourceNotes: "" } });
    expect(conflict.status()).toBe(409);
    for (const width of [390, 1440]) {
      await editorPage.setViewportSize({ width, height: 900 });
      expect(await editorPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await editorPage.getByLabel(/^Appearance/).fill("An unsaved edit that must survive revocation.");
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveValue("An unsaved edit that must survive revocation.");
    localLibrarySql(`delete from public.campaign_system_library_editors where campaign_id = ${sqlLiteral(campaign.campaignId)} and user_id = ${sqlLiteral(userId)};`);
    await editorPage.getByRole("button", { name: "SAVE REVISION", exact: true }).click();
    await expect(editorPage.getByRole("alert").filter({ hasText: "Campaign library editor access is required." })).toBeVisible();
    await expect(editorPage.getByLabel(/^Appearance/)).toHaveValue("An unsaved edit that must survive revocation.");
    editorPage.once("dialog", (dialog) => dialog.dismiss());
    await editorPage.getByRole("link", { name: "Library", exact: true }).click();
    await expect(editorPage).toHaveURL(detailPath);
    editorPage.once("dialog", (dialog) => dialog.accept());
    await editorPage.getByRole("link", { name: "Ancestries", exact: true }).click();
    await expect(editorPage).toHaveURL(`${libraryPath}/ancestries`);
    await editorPage.setViewportSize({ width: 1440, height: 900 });
    await editorPage.getByRole("link", { name: "Creature traits", exact: true }).click();
    await expect(editorPage.getByText("292 of 292 entries")).toBeVisible();
    await expect(editorPage.locator("[data-library-entries] li p")).toHaveCount(0);
    await editorPage.getByRole("textbox", { name: "Name", exact: true }).fill("Undead");
    await editorPage.getByRole("button", { name: "SEARCH", exact: true }).click();
    await expect(editorPage).toHaveURL(/q=Undead/);
    await expect(editorPage.getByRole("link", { name: "Undead", exact: true })).toBeVisible();
    await editorPage.goBack();
    await expect(editorPage.getByText("292 of 292 entries")).toBeVisible();
  } finally {
    try {
      localLibrarySql(`delete from public.campaign_system_reference_revisions where campaign_id = ${sqlLiteral(campaign.campaignId)} and reference_id = ${sqlLiteral(referenceId)}; delete from public.system_reference_entries where reference_id = ${sqlLiteral(referenceId)};`);
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) throw removed.error;
    } finally {
      await editorContext.close();
    }
  }
});

test("keeps library navigation in the campaign shell and redirects old campaign links", async ({ page, campaign }) => {
  const library = `/campaigns/${campaign.campaignId}/library`;
  await page.goto(`/system/creature-traits?campaign=${campaign.campaignId}&q=Undead`);
  await expect(page).toHaveURL(`${library}/creature-traits?q=Undead`);
  await expect(page.getByRole("link", { name: "Undead", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Undead", exact: true }).click();
  await expect(page).toHaveURL(`${library}/creature-traits/sf2e.creature-traits.undead`);
  await page.reload();
  await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Library", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(`${library}/creature-traits?q=Undead`);

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Library", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "NPCs", exact: true }).click();
  await expect(page).toHaveURL(`/campaigns/${campaign.campaignId}/npcs`);
  await expect(page.locator("[data-campaign-sidebar]")).not.toHaveClass(/max-\[760px\]:translate-x-0/);
  await page.goto("/system");
  await expect(page).toHaveURL("/campaigns");
  await expect(page.getByRole("link", { name: "System library", exact: true })).toHaveCount(0);
});

test("keeps brief references staged, warns about changed context and applies only on request", async ({ page, campaign }) => {
  test.setTimeout(60000);
  const ancestry = searchReferences("ancestry", "Kasatha")[0];
  let revision = 1;
  const source = () => ({ ...ancestry.binding, name: ancestry.name, kind: "ancestry", sourceUrl: ancestry.sourceUrl,
    coverage: "available", origin: "user-entered", revision, includedSections: ["appearance"], contextHash: String(revision).repeat(64) });
  await page.route("**/references/context", async (route) => {
    const input = route.request().postDataJSON();
    const bound = input.selections.some((selection: { binding: { id: string } | null }) => selection.binding?.id === ancestry.binding.id);
    await route.fulfill({ status: 200, json: { sources: bound ? [source()] : [], promptCharacters: bound ? 100 : 0,
      availability: bound ? [{ kind: "ancestry", id: ancestry.binding.id, name: ancestry.name, state: "available" }] : [{ kind: "ancestry", state: "unbound" }] } });
  });
  await page.route("**/api/ai/enemy/brief", async (route) => {
    expect(route.request().postDataJSON().systemReferences.ancestry).toEqual(ancestry.binding);
    await route.fulfill({ status: 200, json: { references: [source()], draft: { playerDescription: "A four-armed traveler.", artSubject: "A four-armed traveler on a station." } } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/enemies`);
  await page.getByRole("button", { name: "ADD ENEMY", exact: true }).click();
  const editor = page.locator("[data-enemy-editor]");
  await editor.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
  await editor.getByRole("combobox", { name: "Ancestry reference", exact: true }).fill("Kasatha");
  await editor.getByRole("option", { name: /^Kasatha/ }).click();
  await editor.getByRole("button", { name: "GENERATE BRIEF", exact: true }).click();
  await expect(editor.getByRole("button", { name: "APPLY PLAYER BRIEF", exact: true })).toBeVisible();
  await expect(editor.getByText(/User-entered library revision 1/)).toBeVisible();
  revision = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(editor.getByRole("status").filter({ hasText: "have changed since this draft" })).toBeVisible();
  await expect(editor.getByText(/User-entered library revision 1/)).toBeVisible();
  await editor.getByRole("button", { name: "APPLY PLAYER BRIEF", exact: true }).click();
  await expect(editor.getByRole("combobox", { name: "Ancestry reference", exact: true })).toHaveValue("Kasatha");
  await expect(editor.locator("form.character-form")).toBeVisible();
  await expect(editor.getByText("A four-armed traveler.", { exact: true })).toBeVisible();
});

test("persists independent campaign opt-ins and rejects player changes", async ({ browser, page, campaign }) => {
  test.setTimeout(60000);
  const endpoint = `/api/campaigns/${campaign.campaignId}/system-references`;
  const initial = await page.request.get(endpoint);
  expect(initial.ok()).toBeTruthy();
  const previous = (await initial.json()).settings;
  const playerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3100", storageState: "playwright/.auth/player.json" });
  try {
    expect((await page.request.put(endpoint, { data: { appearance: false, lore: false, creatureTraits: false } })).ok()).toBeTruthy();
    await page.goto(`/campaigns/${campaign.campaignId}/settings`);
    await page.getByRole("tab", { name: /AI SETUP/ }).click();
    await expect(page.getByRole("heading", { name: "System reference context", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await page.getByRole("link", { name: "Generation context", exact: true }).click();
    await expect(page).toHaveURL(`/campaigns/${campaign.campaignId}/library/generation`);
    await expect(page.getByLabel("Use ancestry appearance", { exact: true })).not.toBeChecked();
    await page.getByLabel("Use ancestry appearance", { exact: true }).check();
    await page.getByLabel("Use creature-trait context", { exact: true }).check();
    await page.getByRole("button", { name: "SAVE SYSTEM SETTINGS", exact: true }).click();
    await expect(page.getByText("System reference settings saved.")).toBeVisible();
    expect((await (await page.request.get(endpoint)).json()).settings).toEqual({ appearance: true, lore: false, creatureTraits: true });
    expect((await playerContext.request.put(endpoint, { data: { appearance: false, lore: true, creatureTraits: false } })).status()).toBe(403);
    const playerPage = await playerContext.newPage();
    await playerPage.goto(`/campaigns/${campaign.campaignId}/library/ancestries`);
    await expect(playerPage.locator("[data-campaign-shell]")).toHaveCount(1);
    await expect(playerPage.getByRole("link", { name: "Generation context", exact: true })).toHaveCount(0);
    await playerPage.goto(`/campaigns/${campaign.campaignId}/library/generation`);
    await expect(playerPage.getByRole("alert").filter({ hasText: "Only campaign GMs" })).toBeVisible();
    await expect(playerPage.getByRole("checkbox")).toHaveCount(0);
  } finally {
    await playerContext.close();
    expect((await page.request.put(endpoint, { data: previous })).ok()).toBeTruthy();
  }
});

test("saves explicit enemy ancestry/traits and clears a binding when its trait is removed", async ({ page, campaign }) => {
  test.setTimeout(60000);
  let enemyId: string | null = null;
  const endpoint = `/api/campaigns/${campaign.campaignId}/enemies`;
  try {
    await page.goto(`/campaigns/${campaign.campaignId}/enemies`);
    await page.getByRole("button", { name: "ADD ENEMY", exact: true }).click();
    const editor = page.locator("[data-enemy-editor]");
    const form = editor.locator("form.character-form");
    await expect(editor.getByText("SYSTEM REFERENCES", { exact: true })).toHaveCount(0);
    await form.getByLabel("Name", { exact: true }).fill(`Reference enemy ${Date.now()}`);
    await editor.getByRole("combobox", { name: "Ancestry reference", exact: true }).fill("Kasatha");
    await editor.getByRole("option", { name: /^Kasatha/ }).click();
    const addTrait = editor.getByRole("combobox", { name: "Add trait", exact: true });
    await expect(addTrait.locator("../../..").getByLabel("Traits / type", { exact: true })).toBeVisible();
    await addTrait.fill("Undead");
    await editor.getByRole("option", { name: /^Undead/ }).click();
    await expect(form.getByLabel("Traits / type", { exact: true })).toHaveValue("Undead");
    const removeTrait = editor.getByRole("button", { name: "Remove Undead reference", exact: true });
    await expect(removeTrait.locator("..")).toHaveText("Undead");
    await expect(removeTrait.locator("svg")).toBeVisible();
    await removeTrait.click();
    await expect(removeTrait).toHaveCount(0);
    await expect(form.getByLabel("Traits / type", { exact: true })).toHaveValue("Undead");
    await addTrait.fill("Undead");
    await editor.getByRole("option", { name: /^Undead/ }).click();
    await expect(removeTrait).toBeVisible();
    const saving = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "POST");
    await form.getByRole("button", { name: "SAVE ENEMY", exact: true }).click();
    const saved = await saving;
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const enemy = (await saved.json()).enemy;
    enemyId = enemy.id;
    expect(enemy.system_references).toEqual({
      ancestry: searchReferences("ancestry", "Kasatha")[0].binding,
      creatureTraits: [{ id: "sf2e.creature-traits.undead", catalogVersion: expect.any(String) }],
    });
    const updated = await page.request.patch(`${endpoint}/${enemyId}`, { data: { expectedUpdatedAt: enemy.updated_at, traits: ["Custom"] } });
    expect(updated.ok(), await updated.text()).toBeTruthy();
    const reread = await page.request.get(`${endpoint}/${enemyId}`);
    expect((await reread.json()).enemy.system_references).toEqual({ ancestry: enemy.system_references.ancestry, creatureTraits: [] });
  } finally {
    if (enemyId) expect((await page.request.delete(`${endpoint}/${enemyId}`)).ok()).toBeTruthy();
  }
});

test("adds searched traits to the AI classification and generation requests", async ({ page, campaign }) => {
  test.setTimeout(60000);
  const requests: Array<{ traits?: string[]; systemReferences: { ancestry: unknown; creatureTraits: Array<{ id: string }> } }> = [];
  await page.route("**/api/ai/enemy", async (route) => {
    const body = route.request().postDataJSON() as (typeof requests)[number];
    requests.push(body);
    const statBlock = enemyStatBlockSchema.parse({ schemaVersion: 1 });
    statBlock.defenses.armorClass = 18;
    statBlock.defenses.hitPoints = [{ label: "HP", value: 30, notes: "" }];
    await route.fulfill({ status: 200, json: { references: [], draft: {
      name: "Trait test", playerDescription: "A test creature.", level: 1, size: "medium", rarity: "common",
      traits: body.traits ?? [], family: null, statBlock,
      gmNotesMarkdown: "", artSubject: "",
    } } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/enemies`);
  await page.getByRole("button", { name: "ADD ENEMY", exact: true }).click();
  const editor = page.locator("[data-enemy-editor]");
  await editor.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
  const classification = editor.getByLabel("Type / classification", { exact: true });
  const traitSearch = editor.getByRole("combobox", { name: "Add trait", exact: true });
  await expect(traitSearch.locator("../../..").getByLabel("Type / classification", { exact: true })).toBeVisible();
  await expect(editor.getByText("SYSTEM REFERENCES", { exact: true })).toHaveCount(0);
  await editor.getByRole("combobox", { name: "Ancestry reference", exact: true }).fill("Kasatha");
  await editor.getByRole("option", { name: /^Kasatha/ }).click();
  await classification.fill("undead");
  await traitSearch.fill("Undead");
  await editor.getByRole("option", { name: /^Undead/ }).click();
  await expect(classification).toHaveValue("undead");
  await editor.getByRole("button", { name: "BACK TO EDITOR", exact: true }).click();
  await expect(editor.locator("form.character-form").getByLabel("Traits / type", { exact: true })).toHaveValue("");
  await editor.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
  await expect(classification).toHaveValue("undead");
  await expect(editor.getByRole("button", { name: "Remove Undead reference", exact: true })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await traitSearch.focus();
    await traitSearch.press("ArrowDown");
    await expect(editor.getByRole("option").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await traitSearch.press("Escape");
  }
  await editor.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
  await expect(editor.getByRole("button", { name: "USE DRAFT", exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({
    traits: ["undead"],
    systemReferences: { ancestry: searchReferences("ancestry", "Kasatha")[0].binding, creatureTraits: [{ id: "sf2e.creature-traits.undead" }] },
  });
  await traitSearch.fill("Acid");
  await editor.getByRole("option", { name: /^Acid/ }).click();
  await expect(classification).toHaveValue("undead, Acid");
  await expect(editor.getByRole("button", { name: /^(Keep|Unpin) traits unchanged$/ }).locator("../..").locator("input")).toHaveValue("undead, Acid");
  await editor.getByRole("textbox", { name: "WHAT SHOULD CHANGE?", exact: true }).fill("Make it more resilient.");
  await editor.getByRole("button", { name: "REVISE DRAFT", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].traits).toEqual(["undead", "Acid"]);
  expect(requests[1].systemReferences.creatureTraits.map((binding) => binding.id)).toEqual([
    "sf2e.creature-traits.undead", "sf2e.creature-traits.acid",
  ]);
  await editor.getByRole("button", { name: "USE DRAFT", exact: true }).click();
  await expect(editor.locator("form.character-form").getByLabel("Traits / type", { exact: true })).toHaveValue("undead, Acid");
  await expect(editor.getByRole("button", { name: "Remove Acid reference", exact: true })).toBeVisible();
  await expect(editor.getByRole("combobox", { name: "Ancestry reference", exact: true })).toHaveValue("Kasatha");
  const endpoint = `/api/campaigns/${campaign.campaignId}/enemies`;
  const saving = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "POST");
  await editor.getByRole("button", { name: "SAVE ENEMY", exact: true }).click();
  const saved = await saving;
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const enemy = (await saved.json()).enemy;
  try {
    const reread = await page.request.get(`${endpoint}/${enemy.id}`);
    expect(reread.ok()).toBeTruthy();
    expect((await reread.json()).enemy).toMatchObject({
      traits: ["undead", "Acid"],
      system_references: {
        ancestry: searchReferences("ancestry", "Kasatha")[0].binding,
        creatureTraits: expect.arrayContaining([
          expect.objectContaining({ id: "sf2e.creature-traits.undead" }),
          expect.objectContaining({ id: "sf2e.creature-traits.acid" }),
        ]),
      },
    });
  } finally {
    expect((await page.request.delete(`${endpoint}/${enemy.id}`)).ok()).toBeTruthy();
  }
});
