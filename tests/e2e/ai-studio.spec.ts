import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { getLocalE2eCredentials, getLocalE2eSupabaseConfig } from "./support/local-auth";
import { loadStudioSources, buildStudioManifest, buildStudioPrompt, effectiveStudioStyle, studioManifestHash } from "../../lib/ai/studio-context";
import { studioCompositionSchema } from "../../lib/validation/studio";
import { loadStudioReferenceImages } from "../../lib/ai/studio-references";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eX8AAAAASUVORK5CYII=", "base64");

test("GM composes art and maps, reviews drafts, publishes safely and assigns independent primary art", async ({ page, browser, campaign }) => {
  test.setTimeout(120_000);
  const { supabaseUrl, publishableKey } = getLocalE2eSupabaseConfig();
  const gm = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await gm.auth.signInWithPassword(getLocalE2eCredentials());
  if (auth.error || !auth.data.user) throw new Error("Local Studio E2E authentication failed.");
  const gmId = auth.data.user.id;
  const stamp = randomUUID().slice(0, 8);
  const actorName = `Studio Crew ${stamp}`;
  const placeName = `Studio Hangar ${stamp}`;
  const npcName = `Studio Guide ${stamp}`;
  const enemyName = `Studio Monster ${stamp}`;
  const title = `Reactor clash ${stamp}`;
  const mapTitle = `Hangar battlemap ${stamp}`;
  const paths: string[] = [];
  const runIds: string[] = [];
  const records: { table: string; id: string }[] = [];
  let assisted = 0;
  let generated = 0;
  page.on("dialog", (dialog) => void dialog.accept());
  const playerContext = await browser.newContext({ storageState: "playwright/.auth/player.json", baseURL: "http://127.0.0.1:3100" });
  try {
    const character = await gm.from("characters").insert({ campaign_id: campaign.campaignId, owner_id: gmId, name: actorName, species: "Human", physical_description: "Red jacket and silver armor" }).select("id").single();
    expect(character.error).toBeNull(); records.push({ table: "characters", id: character.data!.id });
    const referencePath = `${campaign.campaignId}/${gmId}/character-${randomUUID()}.png`;
    paths.push(referencePath);
    expect((await gm.storage.from("campaign-art").upload(referencePath, pixel, { contentType: "image/png" })).error).toBeNull();
    expect((await gm.from("characters").update({ art_path: referencePath }).eq("id", character.data!.id)).error).toBeNull();
    const place = await gm.from("places").insert({ campaign_id: campaign.campaignId, author_id: gmId, name: placeName, kind: "hangar", description: "Wide landing pad with cargo cover and a reactor corridor" }).select("id").single();
    expect(place.error).toBeNull(); records.push({ table: "places", id: place.data!.id });
    const npc = await gm.from("npcs").insert({ campaign_id: campaign.campaignId, author_id: gmId, name: npcName, species: "Android", description: "A brass robot guide" }).select("id").single();
    expect(npc.error).toBeNull(); records.push({ table: "npcs", id: npc.data!.id });
    const enemy = await gm.rpc("create_enemy_with_details", {
      p_campaign_id: campaign.campaignId,
      p_public: { name: enemyName, playerDescription: "A crystalline six-legged beast", isRevealed: false, artPath: null },
      p_details: { level: 2, size: "medium", rarity: "common", traits: [], family: null, statBlock: { schemaVersion: 1 }, gmNotesMarkdown: "", origin: "manual", artSubject: "Six-legged crystal monster" },
    });
    expect(enemy.error).toBeNull(); records.push({ table: "enemies", id: enemy.data });
    await page.route("**/api/ai/models**", async (route) => {
      const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
      await route.fulfill({ json: { status: "live", defaultModel: `test/${capability}`, models: [{
        id: `test/${capability}`, label: "Local test model", capability, enabled: true, compatible: true, available: true,
        inputModalities: ["text", "image"], supportedParameters: ["aspect_ratio", "input_references"],
        parameterValues: { aspect_ratio: ["1:1", "16:9"] }, description: "Deterministic local provider fixture", providerName: "test", pricing: null,
      }] } });
    });
    await page.route("**/api/ai/art-prompt", async (route) => {
      assisted++;
      await route.fulfill({ json: { draft: { prompt: "The crew and their guide fight the crystal monster beside cargo cover in the hangar." }, allowance: 600 } });
    });
    await page.route("**/api/ai/image", async (route) => {
      generated++;
      const body = route.request().postDataJSON();
      const composition = studioCompositionSchema.parse(body.studio);
      const sources = await loadStudioSources(gm, campaign.campaignId, composition);
      const styleRow = await gm.from("campaigns").select("visual_style").eq("id", campaign.campaignId).single();
      const manifest = buildStudioManifest(composition, body.subject, sources, effectiveStudioStyle(composition, styleRow.data!.visual_style));
      const prompt = buildStudioPrompt(body.targetKind, manifest);
      expect(body.currentPrompt).toBe(prompt);
      if (sources.references.length) expect(await loadStudioReferenceImages(gm, campaign.campaignId, sources.references)).toHaveLength(1);
      if (body.targetKind === "battlemap") {
        expect(prompt).toContain("true top-down orthographic");
        expect(sources.sources.map((source) => source.kind)).toEqual(["place"]);
      }
      const run = await gm.from("ai_generation_runs").insert({
        campaign_id: campaign.campaignId, requested_by: gmId, kind: "image", mode: "create", model: "test/image",
        provider: "openrouter", prompt_hash: createHash("sha256").update(prompt).digest("hex"),
        purpose: "studio-art", target_kind: body.targetKind, studio_manifest_hash: studioManifestHash(manifest),
        status: "complete", aspect_ratio: body.aspectRatio,
      }).select("id,created_at").single();
      expect(run.error).toBeNull(); runIds.push(run.data!.id);
      const path = `${campaign.campaignId}/${gmId}/studio-draft-${run.data!.id}.png`;
      paths.push(path);
      expect((await gm.storage.from("campaign-art").upload(path, pixel, { contentType: "image/png" })).error).toBeNull();
      expect((await gm.rpc("attach_ai_generation_image", { p_generation_run_id: run.data!.id, p_image_path: path, p_image_media_type: "image/png" })).data).toBe(true);
      const signed = await gm.storage.from("campaign-art").createSignedUrl(path, 600);
      await route.fulfill({ json: { draft: {
        generationRunId: run.data!.id, targetKind: body.targetKind, purpose: "studio-art", mode: "create",
        subject: body.subject, prompt, aspectRatio: body.aspectRatio, studioManifest: manifest, provider: "openrouter",
        model: "test/image", createdAt: new Date(run.data!.created_at).toISOString(), temporaryPath: path, image: { url: signed.data!.signedUrl, base64: null, mediaType: "image/png" },
      } } });
    });
    await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
    await expect(page.getByRole("heading", { name: "AI Studio", exact: true })).toBeVisible();
    const composer = page.getByRole("region", { name: "AI Studio composer" });
    await composer.getByRole("button", { name: "Add subjects", exact: true }).click();
    for (const [kind, name] of [["place", placeName], ["character", actorName], ["npc", npcName], ["enemy", enemyName]]) {
      await composer.getByLabel("Subject type").selectOption(kind);
      await composer.getByLabel("Search subjects").fill(name);
      await composer.getByRole("button", { name: `Add ${name}`, exact: true }).click();
    }
    const actorChip = composer.getByRole("list", { name: "Selected subjects" }).getByRole("listitem").filter({ hasText: actorName });
    await actorChip.getByRole("button", { name: "Subject options", exact: true }).click();
    await expect(actorChip.getByLabel("Use existing image")).toBeChecked();
    await expect(actorChip.getByLabel("Include description")).not.toBeChecked();
    await actorChip.getByLabel("Use existing image").check();
    await actorChip.getByLabel("Include description").check();
    const promptPanel = composer.getByRole("complementary", { name: "Prompt preview" });
    const generateButton = promptPanel.getByRole("button", { name: "Generate image draft", exact: true });
    await expect(promptPanel.locator("p").filter({ hasText: /^Write a direction to generate\.$/ })).toBeVisible();
    await expect(generateButton).toBeDisabled();

    // Reproduce the reported failure: a ~1,000-character style plus a full-length direction now auto-fits visibly.
    const longStyle = "Gritty painted space opera with rich neon rim light, heavy film grain, weathered metal and dusty air. ".repeat(10).slice(0, 988);
    await composer.getByText("Advanced composition settings", { exact: true }).click();
    await composer.getByLabel("Style text", { exact: true }).fill(longStyle);
    await composer.getByLabel("Direction", { exact: true }).fill("The crew and their guide fight the crystal monster across the cargo deck as sparks rain from the gantry. ".repeat(12).slice(0, 1200));
    await composer.getByLabel(`Description for ${actorName}`, { exact: true }).fill("Red jacket over silver armor; ".repeat(23).slice(0, 690));
    await expect(promptPanel.getByText(/Auto-fit trimmed \d+ section/)).toBeVisible();
    await expect(promptPanel.getByText(/TRIMMED 988→/)).toBeVisible();
    await composer.getByText("Advanced composition settings", { exact: true }).click();
    await expect(composer.getByLabel("Style text", { exact: true })).not.toBeVisible();
    await promptPanel.getByRole("button", { name: /Edit.*style/i }).click();
    await expect(composer.getByLabel("Style text", { exact: true })).toBeFocused();
    const meterValue = Number(await promptPanel.getByRole("meter", { name: "Prompt length" }).getAttribute("aria-valuenow"));
    expect(meterValue).toBeLessThanOrEqual(3000);
    await promptPanel.getByText("Final prompt", { exact: true }).click();
    await expect(promptPanel.locator("pre")).toContainText(`"${actorName}"`);
    await expect(generateButton).toBeEnabled();
    await composer.getByLabel("Style text", { exact: true }).fill("Ink and watercolor.");
    await composer.getByRole("button", { name: "Reset to record text", exact: true }).click();
    await expect(promptPanel.getByText("Everything fits untrimmed.")).toBeVisible();

    await composer.getByLabel("Direction", { exact: true }).fill("Crew fighting the monster in this hangar with their guide.");
    await composer.getByRole("button", { name: "Rewrite direction with AI", exact: true }).click();
    await expect(composer.getByText(/\/ 600 available/)).toBeVisible();
    await composer.getByRole("button", { name: "Apply direction", exact: true }).click();
    await expect(promptPanel.locator("pre")).toContainText("The crew and their guide fight the crystal monster");
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
    await expect(composer.getByLabel("Direction", { exact: true })).not.toBeVisible();
    expect(assisted).toBe(1); expect(generated).toBe(1);
    const primaryBefore = await gm.from("characters").select("art_path").eq("id", character.data!.id).single();
    expect(primaryBefore.data!.art_path).toBe(referencePath);
    await page.reload();
    await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
    await expect(composer.getByLabel("Artwork title", { exact: true })).not.toBeVisible();
    await composer.getByRole("button", { name: "Recover previous image jobs", exact: true }).click();
    await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
    const savePanel = composer.getByRole("region", { name: "Add to campaign library" });
    await expect(savePanel.getByText("Name this image before it can be added to your campaign library.", { exact: true })).toBeVisible();
    await expect(savePanel.getByRole("button", { name: "Add to library", exact: true })).toBeDisabled();
    await composer.getByLabel("Artwork title", { exact: true }).fill(title);
    const addCaption = savePanel.getByRole("button", { name: "+ Add caption", exact: true });
    await expect(addCaption).toHaveAttribute("aria-expanded", "false");
    await addCaption.click();
    const captionField = savePanel.getByRole("textbox", { name: "Artwork caption", exact: true });
    await expect(captionField).toBeVisible();
    await captionField.fill("The crew holds the line.");
    const approvalResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith(`/api/campaigns/${campaign.campaignId}/studio`));
    await savePanel.getByRole("button", { name: "Add to library", exact: true }).click();
    const savedResponse = await approvalResponse;
    expect(savedResponse.status()).toBe(201);
    const { assetId } = await savedResponse.json() as { assetId: string };
    const library = page.getByRole("region", { name: "Private campaign art library" });
    await expect(library).toBeVisible();
    const assetCard = page.getByRole("article", { name: title, exact: true });
    await expect(assetCard).toBeVisible();
    expect((await listPublications()).length).toBe(0);
    const libraryFilters: string[] = [];
    await page.route(`**/api/campaigns/${campaign.campaignId}/studio?*`, async (route) => {
      if (route.request().method() === "GET") {
        libraryFilters.push(new URL(route.request().url()).searchParams.get("filter") ?? "");
      }
      await route.continue();
    });
    let releaseTextSave!: () => void;
    let signalTextSaveStarted!: () => void;
    const textSaveGate = new Promise<void>((resolve) => { releaseTextSave = resolve; });
    const textSaveStarted = new Promise<void>((resolve) => { signalTextSaveStarted = resolve; });
    await page.route(`**/api/campaigns/${campaign.campaignId}/studio/${assetId}`, async (route) => {
      if (route.request().method() === "PATCH" && (route.request().postDataJSON() as { action?: string }).action === "edit") {
        signalTextSaveStarted();
        await textSaveGate;
      }
      await route.continue();
    });
    await assetCard.getByRole("button", { name: "Details", exact: true }).click();
    const textSave = page.waitForRequest((request) =>
      request.method() === "PATCH" && request.url().endsWith(`/api/campaigns/${campaign.campaignId}/studio/${assetId}`));
    await assetCard.getByRole("button", { name: "Save display text", exact: true }).click();
    await textSaveStarted;
    await textSave;
    await library.getByRole("button", { name: "Shared", exact: true }).click();
    await expect(library.getByRole("button", { name: "Shared", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(library.getByText("Nothing is shared with players yet.", { exact: false })).toBeVisible();
    releaseTextSave();
    await expect.poll(() => libraryFilters.length).toBe(2);
    expect(libraryFilters).toEqual(["shared", "shared"]);
    await expect(library.getByRole("button", { name: "Shared", exact: true })).toBeEnabled();
    await expect(library.getByRole("button", { name: "Shared", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.unroute(`**/api/campaigns/${campaign.campaignId}/studio?*`);
    await page.unroute(`**/api/campaigns/${campaign.campaignId}/studio/${assetId}`);
    await library.getByRole("button", { name: "All", exact: true }).click();
    await expect(assetCard).toBeVisible();
    await assetCard.getByRole("button", { name: "Share with players", exact: true }).click();
    await expect(assetCard.getByRole("button", { name: "Unshare", exact: true })).toBeVisible();
    const playerPage = await playerContext.newPage();
    await playerPage.goto(`/campaigns/${campaign.campaignId}/art`);
    await expect(playerPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(playerPage.getByRole("link", { name: "AI Studio", exact: true })).toHaveCount(0);
    await expect(playerPage.getByText("Private generation provenance")).toHaveCount(0);
    expect((await playerPage.request.get(`/api/campaigns/${campaign.campaignId}/studio`)).status()).toBe(403);
    expect((await playerPage.request.post("/api/ai/art-prompt", { data: { campaignId: campaign.campaignId, kind: "scene", direction: "Unauthorised", composition: {} } })).status()).toBe(403);
    await playerPage.getByRole("link", { name: "Open artwork", exact: true }).click();
    await expect(playerPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await assetCard.getByRole("button", { name: "Details", exact: true }).click();
    await expect(assetCard.getByText("Private generation provenance")).toBeVisible();
    await assetCard.getByRole("button", { name: "Assign primary art", exact: true }).click();
    await assetCard.getByLabel("Subject type").selectOption("character");
    await assetCard.getByLabel("Search subjects").fill(actorName);
    await assetCard.getByRole("button", { name: `Add ${actorName}`, exact: true }).click();
    await assetCard.getByRole("button", { name: "Confirm primary art replacement", exact: true }).click();
    await expect(assetCard.getByText(/Primary art replaced/)).toBeVisible();
    const primaryAfter = await gm.from("characters").select("art_path,art_prompt").eq("id", character.data!.id).single();
    expect(primaryAfter.data!.art_path).not.toBe(referencePath); expect(primaryAfter.data!.art_prompt).toBeNull();
    paths.push(primaryAfter.data!.art_path);
    await assetCard.getByRole("button", { name: "Unshare", exact: true }).click();
    await expect(assetCard.getByRole("button", { name: "Share with players", exact: true })).toBeVisible();
    await playerPage.reload();
    await expect(playerPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await assetCard.getByRole("button", { name: "Reuse composition", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("The crew and their guide fight the crystal monster beside cargo cover in the hangar.");
    await expect(composer.getByLabel("Artwork title", { exact: true })).toHaveCount(0);
    await expect(composer.getByLabel("Style text", { exact: true })).not.toBeVisible();
    await expect(composer.getByRole("button", { name: "Resume composition", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await composer.getByRole("button", { name: "Battlemap", exact: true }).click();
    await composer.getByRole("button", { name: "Add subjects", exact: true }).click();
    await composer.getByLabel("Search subjects").fill(placeName);
    await composer.getByRole("button", { name: `Add ${placeName}`, exact: true }).click();
    await composer.getByLabel("Direction", { exact: true }).fill("A damaged research hangar with entrances and cargo cover.");
    await composer.getByText("Advanced composition settings", { exact: true }).click();
    await expect(composer.getByLabel("Map grid")).toHaveValue("gridless");
    await expect(composer.getByLabel("Visual style", { exact: true })).toHaveValue("none");
    await page.setViewportSize({ width: 375, height: 812 });
    await promptPanel.getByText("Final prompt", { exact: true }).click();
    await expect(promptPanel.locator("pre")).toContainText("Map brief: A damaged research hangar");
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
    await composer.getByLabel("Artwork title", { exact: true }).fill(mapTitle);
    await composer.getByRole("region", { name: "Add to campaign library" }).getByRole("button", { name: "Add to library", exact: true }).click();
    await expect(page.getByRole("region", { name: "Private campaign art library" })).toBeVisible();
    await expect(page.getByRole("article", { name: mapTitle, exact: true })).toBeVisible();
    await library.getByRole("button", { name: "Battlemaps", exact: true }).click();
    await expect(library.getByRole("button", { name: "Battlemaps", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article", { name: mapTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: title, exact: true })).toHaveCount(0);
    await library.getByRole("button", { name: "Shared", exact: true }).click();
    await expect(library.getByText("Nothing is shared with players yet.", { exact: false })).toBeVisible();
    await library.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByRole("article", { name: title, exact: true })).toBeVisible();
    expect(assisted).toBe(1); expect(generated).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("article", { name: mapTitle, exact: true }).getByRole("button", { name: "Delete library entry", exact: true }).click();
    await expect(page.getByRole("article", { name: mapTitle, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await composer.getByLabel("Direction", { exact: true }).fill("A new freeform map with narrow corridors.");
    await expect(generateButton).toBeEnabled();
    await page.unroute("**/api/ai/image");
    let interruptedRequests = 0;
    await page.route("**/api/ai/image", async (route) => { interruptedRequests++; await route.abort("connectionreset"); });
    await generateButton.click();
    await expect(composer.getByRole("alert").filter({ hasText: "may have been billed" })).toBeVisible();
    page.removeAllListeners("dialog");
    const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.message()).toContain("may have been billed");
      await dialog.dismiss();
    });
    await generateButton.click();
    await confirmation;
    await expect(generateButton).toBeEnabled();
    expect(interruptedRequests).toBe(1);
  } finally {
    const saved = await gm.from("campaign_art_assets").select("id,path").in("generation_run_id", runIds);
    for (const asset of saved.data ?? []) {
      paths.push(asset.path);
      await gm.rpc("manage_studio_art", { p_campaign_id: campaign.campaignId, p_asset_id: asset.id, p_action: "delete" });
    }
    for (const record of records.reverse()) await gm.from(record.table).delete().eq("id", record.id).eq("campaign_id", campaign.campaignId);
    if (paths.length) await gm.storage.from("campaign-art").remove(paths);
    if (runIds.length) await gm.from("ai_generation_runs").delete().in("id", runIds);
    await playerContext.close(); await gm.auth.signOut({ scope: "local" });
  }
  async function listPublications() {
    const result = await gm.from("campaign_art_publications").select("asset_id").in("asset_id", (await gm.from("campaign_art_assets").select("id").in("generation_run_id", runIds)).data?.map((row) => row.id) ?? []);
    expect(result.error).toBeNull(); return result.data ?? [];
  }
});
