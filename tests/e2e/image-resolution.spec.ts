import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eX8AAAAASUVORK5CYII=";

test.beforeEach(async ({ page }) => {
  await page.route("**/studio/drafts/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/ai/models**", (route) => {
    const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
    const models = (capability === "image" ? ["full", "limited", "automatic"] : ["text"]).map((name) => ({
      id: `test/${name}`, label: name, capability, enabled: true, compatible: true, available: true,
      inputModalities: ["text", "image"], supportedParameters: ["aspect_ratio", ...(name === "automatic" ? [] : ["resolution"])],
      parameterValues: { aspect_ratio: ["1:1", "16:9"], ...(name === "full" ? { resolution: ["1K", "2K", "4K"] } : name === "limited" ? { resolution: ["2K"] } : {}) },
      description: "", providerName: "test", pricing: null,
    }));
    return route.fulfill({ json: { status: "live", defaultModel: models[0].id, models } });
  });
  await page.route("**/api/ai/image", (route) => {
    const body = route.request().postDataJSON();
    const manifest = body.edit?.source.manifest ?? (body.studio
      ? { direction: body.subject, composition: body.studio, sources: [], references: [], style: "" }
      : body.purpose === "studio-art" && body.edit
        ? { direction: "Saved artwork", composition: { subjects: [], grid: "gridless", useCampaignStyle: false }, sources: [], references: [], style: "" }
        : undefined);
    return route.fulfill({ json: { draft: {
      generationRunId: randomUUID(), targetKind: body.targetKind, purpose: body.purpose ?? "entity-art",
      mode: body.mode, operation: body.operation ?? "generate", subject: body.subject ?? manifest?.direction ?? "Record artwork",
      resolution: body.resolution, aspectRatio: body.aspectRatio, prompt: body.currentPrompt ?? "Original image direction",
      ...(manifest ? { studioManifest: manifest } : {}),
      provider: "openrouter", model: body.model ?? "test/full", createdAt: new Date().toISOString(),
      image: { url: null, base64: pixel, mediaType: "image/png" },
    } } });
  });
});

test("saved artwork editing exposes supported resolution choices beside the edit action", async ({ page, campaign }) => {
  const assetId = randomUUID();
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio?*`, (route) => route.fulfill({ json: { assets: [{
    id: assetId, campaign_id: campaign.campaignId, title: "Saved reactor", caption: "", kind: "scene",
    path: `${campaign.campaignId}/${randomUUID()}/studio-${assetId}.png`, media_type: "image/png",
    prompt: "Saved artwork", manifest: { direction: "Saved artwork", composition: { subjects: [], grid: "gridless", useCampaignStyle: false }, sources: [], references: [], style: "" },
    model: "test/full", provider: "openrouter", aspect_ratio: "1:1", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null,
    signedUrl: `data:image/png;base64,${pixel}`, shared: false,
  }] } }));
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Refresh library previews", exact: true }).click();
  await page.getByRole("article", { name: "Saved reactor" }).getByRole("button", { name: "Edit image with AI" }).click();
  const edit = page.getByRole("region", { name: "EDIT WITH AI" });
  const editResolution = edit.getByLabel("Edit image resolution", { exact: true });
  await expect(editResolution).toHaveValue("1K");
  await editResolution.selectOption("4K");
  await edit.getByLabel("Describe the change").fill("Change the lighting to blue");
  const request = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await edit.getByRole("button", { name: "APPLY EDIT" }).click();
  expect((await request).postDataJSON()).toMatchObject({ resolution: "4K", operation: "edit", edit: { source: { type: "studio-asset", assetId } } });
});

test("Gemini 2.5 Flash Image explains its automatic output size in compose and edit", async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) => {
    const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
    const model = capability === "image" ? "google/gemini-2.5-flash-image" : "test/text";
    return route.fulfill({ json: { status: "live", defaultModel: model, models: [{
      id: model, label: model, capability, enabled: true, compatible: true, available: true,
      inputModalities: ["text", "image"], supportedParameters: ["aspect_ratio", "input_references"],
      parameterValues: { aspect_ratio: ["1:1", "16:9"] }, description: "", providerName: "test", pricing: null,
    }] } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await expect(composer.getByText("No selectable 1K, 2K or 4K resolutions are advertised", { exact: false })).toBeVisible();
  await expect(composer.getByLabel("Image resolution", { exact: true })).toHaveCount(0);
  await composer.getByLabel("Direction", { exact: true }).fill("A station hangar at dawn");
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  const generate = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  expect((await generate).postDataJSON()).not.toHaveProperty("resolution");
  const review = composer.getByRole("region", { name: "Review image draft" });
  await expect(review.getByText("No selectable 1K, 2K or 4K resolutions are advertised", { exact: false })).toBeVisible();
  await review.getByLabel("Describe the change").fill("Make the lighting blue");
  const edit = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await review.getByRole("button", { name: "APPLY EDIT" }).click();
  expect((await edit).postDataJSON()).not.toHaveProperty("resolution");
});

test("Studio renders at the chosen tier, remembers it for redo and checkpoints, and filters model choices", async ({ page, campaign }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const resolution = composer.getByLabel("Image resolution", { exact: true });
  await expect(resolution).toHaveValue("1K");
  await expect(resolution.locator("option")).toHaveText(["1K", "2K", "4K"]);
  await resolution.selectOption("4K");
  await composer.getByLabel("Direction", { exact: true }).fill("A station hangar at dawn");
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  page.on("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await expect(resolution).toHaveValue("1K");
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(resolution).toHaveValue("4K");
  await expect(composer.getByRole("group", { name: "Image generation action", exact: true }).getByRole("tooltip", { includeHidden: true })).toHaveCount(0);
  const request = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  expect((await request).postDataJSON().resolution).toBe("4K");
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  const review = composer.getByRole("region", { name: "Review image draft" });
  const editResolution = review.getByLabel("Edit image resolution", { exact: true });
  await expect(editResolution).toHaveValue("4K");
  await editResolution.selectOption("2K");
  await composer.getByLabel("Describe the change").fill("Make the hangar lighting blue");
  const edit = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await composer.getByRole("button", { name: "APPLY EDIT", exact: true }).click();
  expect((await edit).postDataJSON()).toMatchObject({ resolution: "2K", operation: "edit" });
  await expect(composer.getByRole("button", { name: "APPLY EDIT", exact: true })).toBeDisabled();
  await composer.getByRole("button", { name: "Redo with changes", exact: true }).click();
  await expect(resolution).toHaveValue("2K");
  await composer.getByLabel("Image generation model").selectOption("test/limited");
  await expect(resolution).toHaveValue("2K");
  await expect(resolution.locator("option")).toHaveText(["2K"]);
  await composer.getByLabel("Image generation model").selectOption("test/automatic");
  await expect(resolution).toHaveCount(0);
  await expect(composer.getByText("No selectable 1K, 2K or 4K resolutions are advertised", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("region", { name: "Private campaign art library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upscale to 4K", exact: true })).toHaveCount(0);
});

test("record art sends the selected resolution and keeps it for redo", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/jobs`);
  await page.getByRole("button", { name: "NEW MISSION" }).click();
  await page.getByRole("button", { name: "GENERATE ART", exact: true }).click();
  const resolution = page.getByLabel("Image resolution", { exact: true });
  await expect(resolution).toHaveValue("1K");
  await resolution.selectOption("2K");
  await page.getByLabel("Artwork description").fill("A courier skiff crossing a frontier moon");
  const first = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
  expect((await first).postDataJSON().resolution).toBe("2K");
  await expect(page.getByRole("button", { name: "REDO DRAFT", exact: true })).toBeVisible();
  await expect(resolution).toHaveValue("2K");
  const redo = page.waitForRequest((value) => value.method() === "POST" && value.url().endsWith("/api/ai/image"));
  await page.getByRole("button", { name: "REDO DRAFT", exact: true }).click();
  expect((await redo).postDataJSON()).toMatchObject({ resolution: "2K", operation: "redo" });
  await page.getByLabel("Image generation model").selectOption("test/limited");
  await expect(resolution.locator("option")).toHaveText(["2K"]);
  await page.getByLabel("Image generation model").selectOption("test/automatic");
  await expect(resolution).toHaveCount(0);
});
