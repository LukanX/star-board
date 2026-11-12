import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import type { CampaignVisualStyle } from "@/lib/campaign/visual-styles";

const compactStyle = "Ink contours; cyan and amber palette; dramatic rim light; clean silhouettes; subtle grain.";
const styleDraft = { name: "Neon frontier", visualStyle: compactStyle, rationale: "A readable frontier style." };
const trimming = { originalLength: 684, includedLength: compactStyle.length };
const trimmingNotice = `Style trimmed from ${trimming.originalLength} to ${trimming.includedLength} characters. Review before saving.`;

async function openStyleSettings(page: Page, campaignId: string, styles: CampaignVisualStyle[] = []) {
  await page.route("**/api/ai/models**", (route) =>
    route.fulfill({ status: 200, json: { status: "live", models: [] } }),
  );
  await page.route(`**/api/campaigns/${campaignId}/visual-styles`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: { styles } });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/campaigns/${campaignId}/settings`);
  await page.getByRole("tab", { name: /VISUAL STYLES/ }).click();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`reviews and explicitly saves trimmed style text at ${viewport.width}px`, async ({ page, campaign }) => {
    await page.setViewportSize(viewport);
    await openStyleSettings(page, campaign.campaignId);
    await page.route("**/api/ai/visual-style", (route) =>
      route.fulfill({ status: 200, json: { draft: styleDraft, trimming } }),
    );
    let saveCount = 0;
    await page.route(`**/api/campaigns/${campaign.campaignId}/visual-styles`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      saveCount++;
      await route.fulfill({ status: 201, json: { styleId: "00000000-0000-4000-8000-000000000094" } });
    });

    await page.getByRole("button", { name: "NEW STYLE", exact: true }).click();
    await page.getByRole("button", { name: "DRAFT VISUAL STYLE", exact: true }).click();
    const wizard = page.locator("[data-visual-style-wizard]");
    await expect(wizard.getByLabel(/VISUAL STYLE DETAILS/)).toHaveValue(compactStyle);
    await expect(wizard.getByRole("status")).toHaveText(trimmingNotice);
    await expect(wizard.getByText(/AI drafts target 200-300 characters/)).toBeVisible();
    expect(saveCount).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const noticeBox = await wizard.getByRole("status").boundingBox();
    expect(noticeBox).not.toBeNull();
    expect(noticeBox!.x).toBeGreaterThanOrEqual(0);
    expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(viewport.width);

    const savedRequest = page.waitForRequest((request) =>
      request.method() === "POST" && new URL(request.url()).pathname === `/api/campaigns/${campaign.campaignId}/visual-styles`,
    );
    await wizard.getByRole("button", { name: "SAVE READY", exact: true }).click();
    expect((await savedRequest).postDataJSON()).toMatchObject({ name: styleDraft.name, visualStyle: compactStyle, status: "ready", apply: false });
    await expect(page.getByRole("button", { name: "NEW STYLE", exact: true })).toBeVisible();
    expect(saveCount).toBe(1);
  });
}

test("clears trimming notices on manual edits, regeneration, and blank drafts", async ({ page, campaign }) => {
  await openStyleSettings(page, campaign.campaignId);
  let shouldTrim = true;
  await page.route("**/api/ai/visual-style", (route) =>
    route.fulfill({ status: 200, json: { draft: styleDraft, ...(shouldTrim ? { trimming } : {}) } }),
  );
  await page.getByRole("button", { name: "NEW STYLE", exact: true }).click();
  await page.getByRole("button", { name: "DRAFT VISUAL STYLE", exact: true }).click();
  const wizard = page.locator("[data-visual-style-wizard]");
  await expect(wizard.getByRole("status")).toHaveText(trimmingNotice);

  await wizard.getByLabel(/VISUAL STYLE DETAILS/).fill(`${compactStyle} Painted highlights.`);
  await expect(wizard.getByRole("status")).toHaveCount(0);

  await wizard.getByRole("button", { name: "ADJUST QUESTIONS", exact: true }).click();
  await wizard.getByRole("button", { name: "DRAFT VISUAL STYLE", exact: true }).click();
  await expect(wizard.getByRole("status")).toHaveText(trimmingNotice);
  shouldTrim = false;
  await wizard.getByRole("button", { name: "ADJUST QUESTIONS", exact: true }).click();
  await wizard.getByRole("button", { name: "DRAFT VISUAL STYLE", exact: true }).click();
  await expect(wizard.getByLabel(/VISUAL STYLE DETAILS/)).toHaveValue(compactStyle);
  await expect(wizard.getByRole("status")).toHaveCount(0);

  shouldTrim = true;
  await wizard.getByRole("button", { name: "ADJUST QUESTIONS", exact: true }).click();
  await wizard.getByRole("button", { name: "DRAFT VISUAL STYLE", exact: true }).click();
  await expect(wizard.getByRole("status")).toHaveText(trimmingNotice);
  await wizard.getByRole("button", { name: "ADJUST QUESTIONS", exact: true }).click();
  await wizard.getByRole("button", { name: "START BLANK DRAFT", exact: true }).click();
  await expect(wizard.getByLabel(/VISUAL STYLE DETAILS/)).toHaveValue("");
  await expect(wizard.getByRole("status")).toHaveCount(0);
});

test("keeps existing long styles editable and saves manual text without shortening it", async ({ page, campaign }) => {
  const longStyle = `${compactStyle} `.repeat(14).slice(0, 1200).trim();
  const style: CampaignVisualStyle = {
    id: "00000000-0000-4000-8000-000000000095",
    name: "Existing detailed style",
    visualStyle: longStyle,
    status: "ready",
    wizardInputs: { artDirection: "choose-for-me" },
    revision: 2,
    isApplied: true,
    preview: null,
    createdAt: "2026-10-30T12:00:00Z",
    updatedAt: "2026-10-30T12:00:00Z",
  };
  await openStyleSettings(page, campaign.campaignId, [style]);
  await page.route(`**/api/campaigns/${campaign.campaignId}/visual-styles/${style.id}`, (route) =>
    route.fulfill({ status: 200, json: { styleId: style.id } }),
  );
  await page.getByRole("button", { name: "EDIT", exact: true }).click();
  const wizard = page.locator("[data-visual-style-wizard]");
  const details = wizard.getByLabel(/VISUAL STYLE DETAILS/);
  await expect(details).toHaveValue(longStyle);
  await expect(details).toHaveAttribute("maxlength", "1200");
  await expect(wizard.getByRole("status")).toHaveCount(0);
  const manuallyEditedStyle = `${longStyle.slice(0, 1180)}; muted highlights`;
  await details.fill(manuallyEditedStyle);

  const savedRequest = page.waitForRequest((request) =>
    request.method() === "PATCH" && new URL(request.url()).pathname === `/api/campaigns/${campaign.campaignId}/visual-styles/${style.id}`,
  );
  await wizard.getByRole("button", { name: "SAVE READY", exact: true }).click();
  expect((await savedRequest).postDataJSON()).toMatchObject({ visualStyle: manuallyEditedStyle, expectedRevision: 2 });
  await expect(page.getByRole("button", { name: "NEW STYLE", exact: true })).toBeVisible();
});

test("stops polling when an unsaved visual-style preview closes", async ({ page, campaign }) => {
  const generationRunId = "00000000-0000-4000-8000-000000000093";
  let statusRequestCount = 0;

  await page.route(`**/api/campaigns/${campaign.campaignId}/visual-styles`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: { styles: [] } });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/ai/image**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "POST" && pathname === "/api/ai/image") {
      const now = new Date().toISOString();
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          job: {
            generationRunId,
            status: "pending",
            targetKind: "visual-style",
            purpose: "style-preview",
            mode: "create",
            subject: "A lone courier skiff crossing a luminous dust storm above a frontier moon",
            aspectRatio: "1:1",
            prompt: "A neutral style preview.",
            model: "openai/gpt-image-1",
            createdAt: now,
            statusUpdatedAt: now,
          },
        }),
      });
      return;
    }

    if (request.method() === "GET" && pathname === `/api/ai/image/${generationRunId}`) {
      statusRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ job: { status: "pending", statusUpdatedAt: new Date().toISOString() } }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto(`/campaigns/${campaign.campaignId}/settings`);
  await page.getByRole("tab", { name: /VISUAL STYLES/ }).click();
  await page.getByRole("button", { name: "NEW STYLE", exact: true }).click();
  await page.getByRole("button", { name: "START BLANK DRAFT", exact: true }).click();
  await page.getByLabel(/VISUAL STYLE DETAILS/).fill("Crisp ink lines with a bright cyan-orange palette.");
  await page.getByRole("button", { name: "GENERATE PREVIEW", exact: true }).click();
  await page.waitForResponse((response) =>
    response.request().method() === "GET"
    && response.url().endsWith(`/api/ai/image/${generationRunId}`),
  );

  await page.getByRole("button", { name: "CANCEL", exact: true }).click();
  await expect(page.getByRole("button", { name: "NEW STYLE", exact: true })).toBeVisible();
  await page.waitForTimeout(2800);

  expect(statusRequestCount).toBe(1);
});