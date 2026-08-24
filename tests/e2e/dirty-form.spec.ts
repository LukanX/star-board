import { expect, test } from "./fixtures";

test("guards internal navigation after a character edit", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/characters`);
  await page.getByRole("button", { name: "ADD CHARACTER" }).click();
  const editorHeading = page.locator(".editor-heading").first();
  await expect(editorHeading).toHaveClass(/flex/);
  await expect(editorHeading).toHaveClass(/gap-4/);
  const editorTitle = editorHeading.locator("h2");
  await expect(editorTitle).toHaveClass(/mt-\[6px\]/);
  await expect(editorTitle).toHaveClass(/text-\[19px\]/);
  await expect(editorTitle).toHaveCSS("margin-top", "6px");
  await expect(editorTitle).toHaveCSS("font-size", "19px");
  await page.getByLabel("Name").fill("Unsaved Crew Record");

  const dialogPromise = page.waitForEvent("dialog");
  const navigationPromise = page.getByRole("link", { name: "Job board", exact: true }).click();
  const dialog = await dialogPromise;

  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("unsaved changes");
  await dialog.dismiss();
  await navigationPromise;
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/characters$`));
});

test("guards internal navigation after a job edit", async ({ page, campaign }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/campaigns/${campaign.campaignId}/jobs`);
  await page.getByRole("button", { name: "NEW MISSION" }).click();
  const campaignArtActions = page.locator("[data-campaign-art-actions]");
  await expect(campaignArtActions).toBeVisible();
  for (const actionName of ["UPLOAD ART", "GENERATE ART"]) {
    const actionButton = campaignArtActions.getByRole("button", { name: actionName, exact: true });
    await expect(actionButton).toHaveClass(/min-h-\[30px\]/);
    await expect(actionButton).toHaveClass(/px-\[10px\]/);
    await expect(actionButton).toHaveClass(/text-\[8px\]/);
    await expect(actionButton).toHaveCSS("min-height", "30px");
    await expect(actionButton).toHaveCSS("padding-left", "10px");
    await expect(actionButton).toHaveCSS("padding-right", "10px");
    await expect(actionButton).toHaveCSS("font-size", "8px");
  }
  await campaignArtActions.getByRole("button", { name: "GENERATE ART", exact: true }).click();
  const aiArtGenerateButton = page.getByRole("button", { name: "GENERATE DRAFT", exact: true });
  await expect(aiArtGenerateButton).toBeVisible();
  await expect(aiArtGenerateButton).toHaveClass(/min-h-\[32px\]/);
  await expect(aiArtGenerateButton).toHaveClass(/px-\[10px\]/);
  await expect(aiArtGenerateButton).toHaveClass(/text-\[8px\]/);
  await expect(aiArtGenerateButton).toHaveCSS("min-height", "32px");
  await expect(aiArtGenerateButton).toHaveCSS("padding-left", "10px");
  await expect(aiArtGenerateButton).toHaveCSS("padding-right", "10px");
  await expect(aiArtGenerateButton).toHaveCSS("font-size", "8px");
  const editorActions = page.locator(".editor-heading-actions").first();
  await expect(editorActions).toHaveClass(/flex/);
  await expect(editorActions).toHaveClass(/max-\[420px\]:w-full/);
  await expect(editorActions).toHaveClass(/max-\[420px\]:justify-start/);
  const editorButton = editorActions.getByRole("button").first();
  await expect(editorButton).toHaveClass(/h-\[37px\]/);
  await expect(editorButton).toHaveClass(/inline-flex/);
  await expect(editorButton).toHaveClass(/items-center/);
  await expect(editorButton).toHaveClass(/justify-center/);
  await expect(editorButton).toHaveClass(/gap-2/);
  await expect(editorButton).toHaveClass(/px-\[14px\]/);
  await expect(editorButton).toHaveClass(/border/);
  await expect(editorButton).toHaveClass(/border-\[var\(--line\)\]/);
  await expect(editorButton).toHaveClass(/text-\[var\(--ink\)\]/);
  await expect(editorButton).toHaveClass(/font-mono/);
  await expect(editorButton).toHaveClass(/text-\[9px\]/);
  await expect(editorButton).toHaveClass(/tracking-\[\.12em\]/);
  await expect(editorButton).toHaveClass(/cursor-pointer/);
  await expect(editorButton).toHaveClass(/transition-\[transform,background,border\]/);
  await expect(editorButton).toHaveClass(/duration-\[200ms\]/);
  await expect(editorButton).toHaveClass(/whitespace-nowrap/);
  await expect(editorButton).toHaveClass(/hover:-translate-y-px/);
  await expect(editorButton).toHaveCSS("height", "37px");
  await expect(editorButton).toHaveCSS("padding-left", "14px");
  await expect(editorButton).toHaveCSS("padding-right", "14px");
  await editorButton.hover();
  await expect(editorButton).toHaveCSS("translate", "0px -1px");
  await expect(editorButton).toHaveClass(/bg-\[rgba\(255,255,255,\.035\)\]/);
  await expect(editorButton).toHaveClass(/text-\[var\(--muted\)\]/);
  await expect(editorButton).toHaveClass(/hover:border-\[rgba\(98,232,255,\.45\)\]/);
  await expect(editorButton).toHaveClass(/hover:text-\[var\(--ink\)\]/);
  await expect(editorButton).toHaveCSS("background-color", "rgba(255, 255, 255, 0.035)");
  await expect(editorButton).toHaveCSS("border-top-color", "rgba(98, 232, 255, 0.45)");
  await expect(editorButton).toHaveCSS("color", "rgb(237, 243, 251)");
  await expect(editorButton).toHaveClass(/max-\[420px\]:flex-1/);
  const saveButton = page.locator("form.character-form button[type=submit]").first();
  await expect(saveButton).toHaveClass(/!border-\[var\(--cyan\)\]/);
  await expect(saveButton).toHaveClass(/bg-\[var\(--cyan\)\]/);
  await expect(saveButton).toHaveClass(/!text-\[#061017\]/);
  await expect(saveButton).toHaveClass(/shadow-\[0_0_20px_rgba\(98,232,255,\.16\)\]/);
  await expect(saveButton).toHaveClass(/hover:bg-\[#8ceeff\]/);
  await expect(saveButton).toHaveCSS("border-top-color", "rgb(98, 232, 255)");
  await expect(saveButton).toHaveCSS("background-color", "rgb(98, 232, 255)");
  await expect(saveButton).toHaveCSS("color", "rgb(6, 16, 23)");
  await saveButton.hover();
  await expect(saveButton).toHaveCSS("background-color", "rgb(140, 238, 255)");
  await editorButton.click();
  const aiButton = page.getByRole("button", { name: "GENERATE CANDIDATE", exact: true });
  await expect(aiButton).toHaveClass(/!border-\[rgba\(255,92,154,\.34\)\]/);
  await expect(aiButton).toHaveClass(/bg-\[rgba\(255,92,154,\.08\)\]/);
  await expect(aiButton).toHaveClass(/!text-\[var\(--pink\)\]/);
  await expect(aiButton).toHaveClass(/hover:!border-\[var\(--pink\)\]/);
  await expect(aiButton).toHaveClass(/hover:bg-\[rgba\(255,92,154,\.14\)\]/);
  await expect(aiButton).toHaveCSS("border-top-color", "rgba(255, 92, 154, 0.34)");
  await expect(aiButton).toHaveCSS("background-color", "rgba(255, 92, 154, 0.08)");
  await expect(aiButton).toHaveCSS("color", "rgb(255, 92, 154)");
  await aiButton.hover();
  await expect(aiButton).toHaveCSS("border-top-color", "rgb(255, 92, 154)");
  await expect(aiButton).toHaveCSS("background-color", "rgba(255, 92, 154, 0.14)");
  await expect(aiButton).toHaveClass(/min-h-\[32px\]/);
  await expect(aiButton).toHaveClass(/px-\[10px\]/);
  await expect(aiButton).toHaveClass(/text-\[8px\]/);
  await expect(aiButton).toHaveClass(/max-\[420px\]:w-full/);
  await expect(aiButton).toHaveCSS("min-height", "32px");
  await expect(aiButton).toHaveCSS("padding-left", "10px");
  await expect(aiButton).toHaveCSS("padding-right", "10px");
  await expect(aiButton).toHaveCSS("font-size", "8px");
  await expect(page.getByRole("button", { name: "CANCEL", exact: true })).toHaveClass(/inline-flex/);
  const closeEditor = page.getByRole("button", { name: "Close mission editor" });
  await expect(closeEditor).toHaveClass(/w-8/);
  await expect(closeEditor).toHaveClass(/h-8/);
  await expect(closeEditor).toHaveClass(/inline-grid/);
  await expect(closeEditor).toHaveClass(/place-items-center/);
  await expect(closeEditor).toHaveClass(/border-transparent/);
  await expect(closeEditor).toHaveClass(/bg-transparent/);
  await expect(closeEditor).toHaveClass(/text-\[var\(--muted\)\]/);
  await expect(closeEditor).toHaveClass(/cursor-pointer/);
  await expect(closeEditor).toHaveClass(/p-0/);
  await expect(closeEditor).toHaveCSS("width", "32px");
  await expect(closeEditor).toHaveCSS("height", "32px");
  await closeEditor.hover();
  await expect(closeEditor).toHaveCSS("color", "rgb(237, 243, 251)");
  const characterForm = page.locator("form.character-form").first();
  await expect(characterForm).toHaveClass(/grid/);
  await expect(characterForm).toHaveClass(/\[&_label\]:grid/);
  await expect(characterForm).toHaveClass(/\[&_input\]:w-full/);
  await expect(characterForm).toHaveClass(/\[&_textarea\]:min-h-\[110px\]/);
  const titleInput = page.getByLabel("Title");
  await expect(titleInput).toHaveCSS("height", "42px");
  await expect(titleInput).toHaveCSS("padding-left", "12px");
  await expect(titleInput).toHaveCSS("font-size", "11px");
  await titleInput.focus();
  await expect(titleInput).toHaveCSS("border-left-color", "rgb(98, 232, 255)");
  const summaryInput = page.getByLabel("Summary");
  await expect(summaryInput).toHaveCSS("min-height", "110px");
  await expect(summaryInput).toHaveCSS("resize", "vertical");
  await expect(page.locator(".character-form-actions").first()).toHaveClass(/flex/);
  await expect(page.locator(".character-form-actions").first()).toHaveClass(/max-\[760px\]:flex-wrap/);
  const formGrid = page.locator(".character-form-grid").first();
  await expect(formGrid).toHaveClass(/max-\[760px\]:grid-cols-2/);
  await expect(formGrid).toHaveClass(/max-\[420px\]:grid-cols-1/);
  await expect(formGrid.locator("label").first()).toHaveClass(/max-\[760px\]:\[grid-column:1\/-1\]/);
  await expect(formGrid.locator("label").first()).toHaveClass(/max-\[420px\]:\[grid-column:auto\]/);
  await expect(page.getByRole("button", { name: "CANCEL", exact: true })).toHaveClass(/max-\[420px\]:w-full/);
  await page.getByLabel("Title").fill("Unsaved Mission");
  await page.getByRole("button", { name: "Open navigation" }).click();

  const dialogPromise = page.waitForEvent("dialog");
  const navigationPromise = page.getByRole("link", { name: "Characters", exact: true }).click();
  const dialog = await dialogPromise;

  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("unsaved changes");
  await dialog.dismiss();
  await navigationPromise;
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/jobs$`));
});

test("guards internal navigation after a place edit", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/places`);
  await page.getByRole("button", { name: "ADD ROOT PLACE" }).click();
  const placeEditor = page.locator("[data-editor-panel]").first();
  await expect(placeEditor).toHaveClass(/mb-\[18px\]/);
  await expect(placeEditor).not.toHaveClass(/place-editor/);
  const privateLock = page.locator("label").filter({ hasText: "GM notes" }).getByText("PRIVATE", { exact: true });
  await expect(privateLock).toHaveClass(/inline-flex/);
  await expect(privateLock).toHaveClass(/items-center/);
  await expect(privateLock).toHaveClass(/gap-1/);
  await expect(privateLock).toHaveClass(/text-\[var\(--pink\)\]/);
  await expect(privateLock).not.toHaveClass(/field-lock/);
  await expect(privateLock).toHaveCSS("gap", "4px");
  await expect(privateLock).toHaveCSS("color", "rgb(255, 92, 154)");
  await page.getByLabel("Name").fill("Unsaved Place");

  const dialogPromise = page.waitForEvent("dialog");
  const navigationPromise = page.getByRole("link", { name: "Job board", exact: true }).click();
  const dialog = await dialogPromise;

  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("unsaved changes");
  await dialog.dismiss();
  await navigationPromise;
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/places$`));
});

test("keeps place artwork frames in route-owned utilities", async ({ page, campaign }) => {
  const placeName = `Artwork Contract ${Date.now()}`;
  let createdPlaceId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/places`);
    await page.getByRole("button", { name: "ADD ROOT PLACE", exact: true }).click();
    await page.getByLabel("Name").fill(placeName);
    const saveResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/campaigns/${campaign.campaignId}/places`));
    await page.getByRole("button", { name: "SAVE PLACE", exact: true }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const savePayload = (await saveResponse.json()) as { place?: { id?: string } };
    createdPlaceId = savePayload.place?.id ?? null;

    const treeArt = page.locator(`[data-place-tree] [aria-label="${placeName} artwork"]`);
    await expect(treeArt).toHaveCount(1);
    await expect(treeArt).toBeVisible();
    await expect(treeArt).toHaveClass(/overflow-hidden/);
    await expect(treeArt).toHaveClass(/w-\[38px\]/);
    await expect(treeArt).toHaveClass(/h-\[38px\]/);
    await expect(treeArt).toHaveClass(/max-\[420px\]:w-\[34px\]/);
    await expect(treeArt).toHaveCSS("width", "38px");

    const layout = page.locator("[data-places-layout]");
    await expect(layout).toHaveCount(1);
    await expect(layout).toHaveClass(/grid/);
    await expect(layout).toHaveClass(/grid-cols-\[minmax\(260px,\.78fr\)_minmax\(0,1\.22fr\)\]/);
    await expect(layout).toHaveClass(/gap-\[14px\]/);
    await expect(layout).toHaveClass(/items-start/);
    await expect(layout).toHaveClass(/max-\[760px\]:grid-cols-1/);
    await expect(layout).not.toHaveClass(/places-layout/);

    const treePanel = layout.locator("[data-places-tree-panel]");
    await expect(treePanel).toHaveClass(/bg-\[rgba\(16,21,30,\.84\)\]/);
    await expect(treePanel).toHaveClass(/min-w-0/);
    await expect(treePanel).toHaveClass(/overflow-hidden/);
    await expect(treePanel).toHaveClass(/shadow-\[0_12px_30px_rgba\(0,0,0,\.12\)\]/);
    await expect(treePanel).toHaveClass(/max-\[760px\]:order-\[1\]/);
    await expect(treePanel).not.toHaveClass(/places-tree-panel/);

    const detailPlaceholder = layout.locator("[data-places-detail-panel]");
    await expect(detailPlaceholder).toHaveClass(/bg-\[rgba\(16,21,30,\.84\)\]/);
    await expect(detailPlaceholder).toHaveClass(/min-w-0/);
    await expect(detailPlaceholder).toHaveClass(/overflow-hidden/);
    await expect(detailPlaceholder).toHaveClass(/min-h-\[430px\]/);
    await expect(detailPlaceholder).toHaveClass(/shadow-\[0_12px_30px_rgba\(0,0,0,\.12\)\]/);
    await expect(detailPlaceholder).toHaveClass(/max-\[760px\]:min-h-0/);
    await expect(detailPlaceholder).toHaveClass(/max-\[760px\]:order-\[-1\]/);
    await expect(detailPlaceholder).not.toHaveClass(/place-detail-panel/);
    const detailPlaceholderCopy = detailPlaceholder.locator("[data-places-detail]");
    await expect(detailPlaceholderCopy).toHaveClass(/min-w-0/);
    await expect(detailPlaceholderCopy).toHaveClass(/p-\[21px\]/);
    await expect(detailPlaceholderCopy).toHaveClass(/max-\[760px\]:p-\[17px\]/);
    await expect(detailPlaceholderCopy).not.toHaveClass(/place-detail/);

    const tree = page.locator("[data-place-tree]");
    await expect(tree).toHaveCount(1);
    await expect(tree).toHaveClass(/p-\[9px_10px_12px\]/);
    await expect(tree).toHaveClass(/max-\[420px\]:px-\[6px\]/);
    await expect(tree).not.toHaveClass(/place-tree/);

    await page.getByRole("button", { name: `Select ${placeName}`, exact: true }).click();
    await page.locator("[data-place-preview]").getByRole("link", { name: "OPEN FULL RECORD", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/places/[^/]+$`));
    const detailPanel = page.locator("[data-place-detail-panel]");
    await expect(detailPanel).toHaveCount(1);
    await expect(detailPanel).toHaveClass(/bg-\[rgba\(16,21,30,\.84\)\]/);
    await expect(detailPanel).toHaveClass(/min-h-\[430px\]/);
    await expect(detailPanel).toHaveClass(/shadow-\[0_12px_30px_rgba\(0,0,0,\.12\)\]/);
    await expect(detailPanel).toHaveClass(/max-\[760px\]:min-h-0/);
    await expect(detailPanel).toHaveClass(/max-\[760px\]:order-\[-1\]/);
    await expect(detailPanel).not.toHaveClass(/place-detail-panel/);

    const detail = detailPanel.locator("[data-place-detail]");
    await expect(detail).toHaveClass(/min-w-0/);
    await expect(detail).toHaveClass(/p-\[21px\]/);
    await expect(detail).toHaveClass(/max-\[760px\]:p-\[17px\]/);
    await expect(detail).not.toHaveClass(/place-detail/);

    const detailHeading = detail.locator("[data-place-detail-heading]");
    await expect(detailHeading).toHaveClass(/flex/);
    await expect(detailHeading).toHaveClass(/items-start/);
    await expect(detailHeading).toHaveClass(/justify-between/);
    await expect(detailHeading).toHaveClass(/gap-\[15px\]/);
    await expect(detailHeading).toHaveClass(/pb-\[17px\]/);
    await expect(detailHeading).toHaveClass(/border-b/);
    await expect(detailHeading).toHaveClass(/border-\[var\(--line\)\]/);
    await expect(detailHeading).toHaveClass(/max-\[420px\]:gap-\[8px\]/);
    await expect(detailHeading).not.toHaveClass(/place-detail-heading/);
    await expect(detailHeading.locator(":scope > div").first()).toHaveClass(/min-w-0/);
    await expect(detailHeading.locator("h2")).toHaveClass(/m-0/);
    await expect(detailHeading.locator("h2")).toHaveClass(/mb-2/);
    await expect(detailHeading.locator("h2")).toHaveClass(/text-\[24px\]/);
    await expect(detailHeading.locator("h2")).toHaveClass(/max-\[760px\]:text-\[20px\]/);
    await expect(detailHeading.locator("[data-place-detail-actions]")).toHaveClass(/max-\[420px\]:gap-0/);

    const breadcrumb = detailHeading.locator("[data-place-breadcrumb]");
    await expect(breadcrumb).toHaveClass(/flex/);
    await expect(breadcrumb).toHaveClass(/items-center/);
    await expect(breadcrumb).toHaveClass(/gap-\[6px\]/);
    await expect(breadcrumb).toHaveClass(/m-0/);
    await expect(breadcrumb).toHaveClass(/text-\[var\(--cyan\)\]/);
    await expect(breadcrumb).toHaveClass(/font-mono/);
    await expect(breadcrumb).toHaveClass(/text-\[8px\]/);
    await expect(breadcrumb).toHaveClass(/tracking-\[\.07em\]/);
    await expect(breadcrumb).toHaveClass(/leading-\[1\.5\]/);
    await expect(breadcrumb).toHaveClass(/flex-wrap/);
    await expect(breadcrumb).toHaveClass(/max-\[420px\]:items-start/);
    await expect(breadcrumb.locator("svg")).toHaveClass(/max-\[420px\]:mt-\[2px\]/);
    await expect(breadcrumb.locator("svg")).toHaveClass(/max-\[420px\]:flex-\[0_0_auto\]/);
    await expect(breadcrumb).not.toHaveClass(/place-breadcrumb/);

    const detailBody = detail.locator("[data-place-detail-body]");
    await expect(detailBody).toHaveClass(/grid/);
    await expect(detailBody).toHaveClass(/gap-\[18px\]/);
    await expect(detailBody).toHaveClass(/pt-\[19px\]/);
    await expect(detailBody).not.toHaveClass(/place-detail-body/);
    const brief = detailBody.locator("[data-place-public-brief]");
    await expect(brief).toHaveClass(/grid/);
    await expect(brief).toHaveClass(/gap-\[8px\]/);
    await expect(brief.locator("p").last()).toHaveClass(/m-0/);
    await expect(brief.locator("p").last()).toHaveClass(/text-\[var\(--muted\)\]/);
    await expect(brief.locator("p").last()).toHaveClass(/text-\[11px\]/);
    await expect(brief.locator("p").last()).toHaveClass(/leading-\[1\.65\]/);
    const previews = detailBody.locator("[data-place-public-preview], [data-place-private-preview]");
    await expect(previews).toHaveCount(2);
    await expect(previews.first()).toHaveClass(/min-w-0/);
    await expect(previews.last()).toHaveClass(/min-w-0/);
    const privatePreview = detailBody.locator("[data-place-private-preview]");
    await expect(privatePreview).toHaveClass(/border-\[rgba\(255,92,154,\.25\)\]/);
    await expect(privatePreview.locator("[data-markdown-toolbar]")).toHaveClass(/text-\[var\(--pink\)\]/);

    const detailArt = page.locator(`[aria-label="${placeName} artwork"]`);
    await expect(detailArt).toHaveCount(1);
    await expect(detailArt).toBeVisible();
    await expect(detailArt).toHaveClass(/grid/);
    await expect(detailArt).toHaveClass(/bg-\[repeating-linear-gradient/);
    await expect(detailArt).toHaveClass(/min-h-\[150px\]/);
    await expect(detailArt).toHaveClass(/aspect-\[16\/7\]/);
    await expect(detailArt).toHaveClass(/max-\[420px\]:min-h-\[120px\]/);
    await expect(detailArt).toHaveCSS("min-height", "150px");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(detailArt).toHaveCSS("min-height", "120px");
    await page.goto(`/campaigns/${campaign.campaignId}/places`);
    await expect(page.locator(`[aria-label="${placeName} artwork"]`)).toHaveCSS("width", "34px");
  } finally {
    if (createdPlaceId) {
      await page.request.delete(new URL(`/api/campaigns/${campaign.campaignId}/places/${createdPlaceId}`, page.url()).toString());
    }
  }
});

test("keeps place search results in route-owned utilities", async ({ page, campaign }) => {
  const placeName = `Search Contract ${Date.now()}`;
  let createdPlaceId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/places`);
    await page.getByRole("button", { name: "ADD ROOT PLACE", exact: true }).click();
    await page.getByLabel("Name").fill(placeName);
    const saveResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/campaigns/${campaign.campaignId}/places`));
    await page.getByRole("button", { name: "SAVE PLACE", exact: true }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const savePayload = (await saveResponse.json()) as { place?: { id?: string } };
    createdPlaceId = savePayload.place?.id ?? null;

    const searchInput = page.getByPlaceholder("Name, kind, or breadcrumb");
    await searchInput.fill(placeName);

    const results = page.locator("[data-place-search-results]");
    await expect(results).toBeVisible();
    await expect(results).toHaveClass(/grid/);
    await expect(results).toHaveClass(/gap-\[1px\]/);
    await expect(results).toHaveClass(/p-\[10px\]/);
    await expect(results).not.toHaveClass(/place-search-results/);

    const result = results.locator("[data-place-search-result]");
    await expect(result).toHaveCount(1);
    await expect(result).toHaveClass(/flex/);
    await expect(result).toHaveClass(/items-center/);
    await expect(result).toHaveClass(/justify-between/);
    await expect(result).toHaveClass(/gap-\[12px\]/);
    await expect(result).toHaveClass(/min-w-0/);
    await expect(result).toHaveClass(/p-\[11px_10px\]/);
    await expect(result).toHaveClass(/border/);
    await expect(result).toHaveClass(/border-\[rgba\(98,232,255,\.45\)\]/);
    await expect(result).toHaveClass(/bg-\[rgba\(98,232,255,\.095\)\]/);
    await expect(result).toHaveClass(/text-\[var\(--ink\)\]/);
    await expect(result).toHaveClass(/text-left/);
    await expect(result).toHaveClass(/cursor-pointer/);
    await expect(result).not.toHaveClass(/place-search-result/);

    const resultCopy = result.locator("span");
    await expect(resultCopy).toHaveClass(/min-w-0/);
    await expect(resultCopy).toHaveClass(/grid/);
    await expect(resultCopy).toHaveClass(/gap-\[4px\]/);
    await expect(result.locator("strong")).toHaveClass(/overflow-hidden/);
    await expect(result.locator("strong")).toHaveClass(/text-\[11px\]/);
    await expect(result.locator("strong")).toHaveClass(/font-\[550\]/);
    await expect(result.locator("strong")).toHaveClass(/text-ellipsis/);
    await expect(result.locator("strong")).toHaveClass(/whitespace-nowrap/);
    await expect(result.locator("small")).toHaveClass(/overflow-hidden/);
    await expect(result.locator("small")).toHaveClass(/text-\[var\(--dim\)\]/);
    await expect(result.locator("small")).toHaveClass(/font-mono/);
    await expect(result.locator("small")).toHaveClass(/text-\[8px\]/);
    await expect(result.locator("small")).toHaveClass(/text-ellipsis/);
    await expect(result.locator("small")).toHaveClass(/whitespace-nowrap/);
    await expect(result.locator("svg")).toHaveClass(/flex-\[0_0_auto\]/);
    await expect(result.locator("svg")).toHaveClass(/text-\[var\(--cyan\)\]/);
  } finally {
    if (createdPlaceId) {
      await page.request.delete(new URL(`/api/campaigns/${campaign.campaignId}/places/${createdPlaceId}`, page.url()).toString());
    }
  }
});

test("renders shared form errors with utility styling", async ({ page, campaign }) => {
  await page.route(`**/api/campaigns/${campaign.campaignId}/places`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Place could not be saved." }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`/campaigns/${campaign.campaignId}/places`);
  await page.getByRole("button", { name: "ADD ROOT PLACE" }).click();
  await page.getByLabel("Name").fill("Failed Place");
  await page.getByRole("button", { name: "SAVE PLACE", exact: true }).click();

  const error = page.getByRole("alert").filter({ hasText: "Place could not be saved." });
  await expect(error).toHaveClass(/m-0/);
  await expect(error).toHaveClass(/text-\[var\(--pink\)\]/);
  await expect(error).toHaveClass(/text-\[10px\]/);
  await expect(error).not.toHaveClass(/form-error/);
  await expect(error).toHaveCSS("margin-top", "0px");
  await expect(error).toHaveCSS("font-size", "10px");
  await expect(error).toHaveCSS("color", "rgb(255, 92, 154)");
});

test("renders danger actions with utility styling", async ({ page, campaign }) => {
  const title = `Danger Variant ${Date.now()}`;
  let createdNoteId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/notes`);
    await page.getByRole("button", { name: "ADD NOTE", exact: true }).first().click();
    await page.getByLabel("Title").fill(title);
    const saveResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/campaigns/${campaign.campaignId}/notes`));
    await page.locator("form.character-form").getByRole("button", { name: "SAVE NOTE", exact: true }).click();
    const saveResponse = await saveResponsePromise;
    const savePayload = (await saveResponse.json()) as { note?: { id?: string } };
    createdNoteId = savePayload.note?.id ?? null;
    await page.getByRole("link", { name: `Open note ${title}` }).click();
    await page.getByRole("button", { name: "EDIT NOTE", exact: true }).click();

    const removeButton = page.getByRole("button", { name: "REMOVE", exact: true });
    await expect(removeButton).toHaveClass(/!border-\[rgba\(255,92,154,\.42\)\]/);
    await expect(removeButton).toHaveClass(/bg-\[rgba\(255,92,154,\.08\)\]/);
    await expect(removeButton).toHaveClass(/!text-\[var\(--pink\)\]/);
    await expect(removeButton).toHaveClass(/hover:!border-\[var\(--pink\)\]/);
    await expect(removeButton).toHaveClass(/hover:bg-\[rgba\(255,92,154,\.14\)\]/);
    await expect(removeButton).toHaveCSS("border-top-color", "rgba(255, 92, 154, 0.42)");
    await expect(removeButton).toHaveCSS("background-color", "rgba(255, 92, 154, 0.08)");
    await expect(removeButton).toHaveCSS("color", "rgb(255, 92, 154)");
    await removeButton.hover();
    await expect(removeButton).toHaveCSS("border-top-color", "rgb(255, 92, 154)");
    await expect(removeButton).toHaveCSS("background-color", "rgba(255, 92, 154, 0.14)");
  } finally {
    if (createdNoteId) {
      await page.request.delete(new URL(`/api/campaigns/${campaign.campaignId}/notes/${createdNoteId}`, page.url()).toString());
    }
  }
});

test("guards internal navigation after a note edit", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/notes`);
  await page.getByRole("button", { name: "ADD NOTE" }).click();
  await page.getByLabel("Title").fill("Unsaved Note");

  const dialogPromise = page.waitForEvent("dialog");
  const navigationPromise = page.getByRole("link", { name: "Places", exact: true }).click();
  const dialog = await dialogPromise;

  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("unsaved changes");
  await dialog.dismiss();
  await navigationPromise;
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/notes$`));
});
