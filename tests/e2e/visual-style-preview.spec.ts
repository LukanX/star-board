import { expect, test } from "./fixtures";

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