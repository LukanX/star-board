import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function createMap(page: Page, width: number, height: number) {
  return page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, width / 2, height);
    context.fillStyle = "#0000ff";
    context.fillRect(width / 2, 0, width / 2, height);
    return canvas.toDataURL("image/png");
  }, { width, height });
}

async function inspectDownload(page: Page, download: Download) {
  const file = await download.path();
  if (!file) throw new Error("The Foundry export did not create a file.");
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
  return page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: "image/webp" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, 0, 0);
    const left = Array.from(context.getImageData(Math.floor(bitmap.width / 4), Math.floor(bitmap.height / 2), 1, 1).data);
    const right = Array.from(context.getImageData(Math.floor(bitmap.width * 3 / 4), Math.floor(bitmap.height / 2), 1, 1).data);
    const result = { width: bitmap.width, height: bitmap.height, left, right };
    bitmap.close();
    return result;
  }, bytes.toString("base64"));
}

test("exports an unsaved draft and saved Library battlemap at the chosen dimensions", async ({ page, campaign }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/studio/drafts/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/ai/models**", (route) => {
    const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
    return route.fulfill({ json: { status: "live", defaultModel: `test/${capability}`, models: [{
      id: `test/${capability}`, label: "Local model", capability, enabled: true, compatible: true, available: true,
      inputModalities: ["text", "image"], supportedParameters: ["aspect_ratio", "resolution"],
      parameterValues: { aspect_ratio: ["1:1", "16:9"], resolution: ["1K", "2K", "4K"] },
      description: "", providerName: "test", pricing: null,
    }] } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const source = await createMap(page, 64, 48);
  let generationRequests = 0;
  await page.route("**/api/ai/image", (route) => {
    generationRequests++;
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { draft: {
      generationRunId: randomUUID(), targetKind: body.targetKind, purpose: "studio-art", mode: "create",
      subject: body.subject, aspectRatio: body.aspectRatio, prompt: body.currentPrompt,
      studioManifest: { direction: body.subject, composition: body.studio, sources: [], references: [], style: "" },
      provider: "openrouter", model: "test/image", createdAt: new Date().toISOString(),
      image: { url: source, base64: null, mediaType: "image/png" },
    } } });
  });
  const assetId = randomUUID();
  let mutationRequests = 0;
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio?*`, (route) => route.fulfill({ json: { assets: [{
    id: assetId, campaign_id: campaign.campaignId, title: "Test battlemap", caption: "", kind: "battlemap",
    path: `${campaign.campaignId}/${randomUUID()}/studio-${assetId}.png`, media_type: "image/png",
    prompt: "Map", manifest: { direction: "Map", composition: { subjects: [], grid: "gridless", useCampaignStyle: false }, sources: [], references: [], style: "" },
    model: "test/image", provider: "openrouter", aspect_ratio: "4:3", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null,
    signedUrl: source, shared: false,
  }] } }));
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio`, (route) => {
    if (route.request().method() === "POST") mutationRequests++;
    return route.continue();
  });
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await expect(composer.getByRole("button", { name: "Export for Foundry" })).toHaveCount(0);
  await composer.getByRole("button", { name: "Battlemap", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("A tactical station hangar");
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  const review = composer.getByRole("region", { name: "Review image draft" });
  await review.getByRole("button", { name: "Export for Foundry" }).focus();
  await page.keyboard.press("Enter");
  const exportPanel = review.getByRole("region", { name: "Foundry battlemap export" });
  const size = exportPanel.getByLabel("Foundry export size");
  await expect(size).toHaveValue("4");
  await expect(exportPanel.getByText("Output: 256 × 192 pixels", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await exportPanel.getByRole("button", { name: "Download WebP" }).focus();
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-foundry-4x\.webp$/);
  const image = await inspectDownload(page, download);
  expect(image).toMatchObject({ width: 256, height: 192 });
  expect(image.left[0]).toBeGreaterThan(220);
  expect(image.left[2]).toBeLessThan(30);
  expect(image.right[2]).toBeGreaterThan(220);
  expect(image.right[0]).toBeLessThan(30);
  await size.selectOption("2");
  const secondDownload = page.waitForEvent("download");
  await exportPanel.getByRole("button", { name: "Download WebP" }).click();
  expect(await inspectDownload(page, await secondDownload)).toMatchObject({ width: 128, height: 96 });
  await size.selectOption("1");
  const originalDownload = page.waitForEvent("download");
  await exportPanel.getByRole("button", { name: "Download WebP" }).click();
  expect(await inspectDownload(page, await originalDownload)).toMatchObject({ width: 64, height: 48 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Refresh library previews", exact: true }).click();
  const card = page.getByRole("article", { name: "Test battlemap" });
  await card.getByRole("button", { name: "Export for Foundry" }).click();
  const libraryExport = card.getByRole("region", { name: "Foundry battlemap export" });
  await expect(libraryExport.getByLabel("Foundry export size")).toHaveValue("4");
  const libraryDownload = page.waitForEvent("download");
  await libraryExport.getByRole("button", { name: "Download WebP" }).click();
  expect(await inspectDownload(page, await libraryDownload)).toMatchObject({ width: 256, height: 192 });
  expect(generationRequests).toBe(1);
  expect(mutationRequests).toBe(0);
});

test("disables oversized exports and defaults to Original without allocating a large output", async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) => route.fulfill({ status: 503, json: { error: "No paid providers in export tests." } }));
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const source = await createMap(page, 2050, 20);
  const assetId = randomUUID();
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio?*`, (route) => route.fulfill({ json: { assets: [{
    id: assetId, campaign_id: campaign.campaignId, title: "Wide battlemap", caption: "", kind: "battlemap",
    path: `${campaign.campaignId}/${randomUUID()}/studio-${assetId}.png`, media_type: "image/png",
    prompt: "Map", manifest: { direction: "Map", composition: { subjects: [], grid: "gridless", useCampaignStyle: false }, sources: [], references: [], style: "" },
    model: "test/image", provider: "openrouter", aspect_ratio: "16:9", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null,
    signedUrl: source, shared: false,
  }] } }));
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Refresh library previews", exact: true }).click();
  const card = page.getByRole("article", { name: "Wide battlemap" });
  await card.getByRole("button", { name: "Export for Foundry" }).click();
  const panel = card.getByRole("region", { name: "Foundry battlemap export" });
  const size = panel.getByLabel("Foundry export size");
  await expect(size).toHaveValue("1");
  await expect(size.locator('option[value="4"]')).toHaveAttribute("disabled", "");
  await expect(size.locator('option[value="2"]')).not.toHaveAttribute("disabled");
  await expect(panel.getByText(/8,192 pixels per edge and 64 million pixels/)).toBeVisible();
});

test("reports an unavailable image and lets the user retry without saving anything", async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) => route.fulfill({ status: 503, json: { error: "No paid providers in export tests." } }));
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const image = await createMap(page, 64, 48);
  const bytes = Buffer.from(image.split(",")[1], "base64");
  const assetId = randomUUID();
  let sourceAvailable = false;
  await page.route("https://storage.example/expired-map.png", (route) => sourceAvailable
    ? route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: bytes })
    : route.fulfill({ status: 403, headers: { "Access-Control-Allow-Origin": "*" } }));
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio?*`, (route) => route.fulfill({ json: { assets: [{
    id: assetId, campaign_id: campaign.campaignId, title: "Expired battlemap", caption: "", kind: "battlemap",
    path: `${campaign.campaignId}/${randomUUID()}/studio-${assetId}.png`, media_type: "image/png",
    prompt: "Map", manifest: { direction: "Map", composition: { subjects: [], grid: "gridless", useCampaignStyle: false }, sources: [], references: [], style: "" },
    model: "test/image", provider: "openrouter", aspect_ratio: "4:3", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null,
    signedUrl: "https://storage.example/expired-map.png", shared: false,
  }] } }));
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Refresh library previews", exact: true }).click();
  const card = page.getByRole("article", { name: "Expired battlemap" });
  await card.getByRole("button", { name: "Export for Foundry" }).click();
  const panel = card.getByRole("region", { name: "Foundry battlemap export" });
  await expect(panel.getByRole("alert")).toContainText("could not be loaded or decoded");
  await expect(panel.getByRole("button", { name: "Download WebP" })).toHaveCount(0);
  sourceAvailable = true;
  await panel.getByRole("button", { name: "Retry image" }).click();
  await expect(panel.getByLabel("Foundry export size")).toHaveValue("4");
  await expect(panel.getByText("Output: 256 × 192 pixels", { exact: true })).toBeVisible();
});
