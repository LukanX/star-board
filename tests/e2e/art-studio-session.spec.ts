import { expect, test } from "./fixtures";

type ImageRequestBody = {
  campaignId: string;
  mode: "create" | "refine";
  targetKind: string;
  visualStyleId?: string;
  subject: string;
  refinement?: string;
  currentPrompt?: string;
};

const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eX8AAAAASUVORK5CYII=";
const sessionPrefix = "star-board:art-studio:v1:";

test("keeps generated image drafts and refinement notes through style changes and reload", async ({ page, campaign }) => {
  test.setTimeout(60_000);
  const timestamp = Date.now();
  const parentName = `Art Session Parent ${timestamp}`;
  const childName = `Art Session Child ${timestamp}`;
  const visualStyleId = "00000000-0000-4000-8000-000000000091";
  const refinement = "Keep the blue lanterns and change the camera angle.";
  const temporaryPaths: string[] = [];
  const imageRequests: ImageRequestBody[] = [];
  const statusRunIds: string[] = [];
  const drafts = new Map<string, { model: string; createdAt: string; temporaryPath: string }>();
  const deletedTemporaryPaths: string[] = [];
  const createdPlaceIds: string[] = [];
  let parentId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/places`);
    const createParentResponse = await page.request.post(
      new URL(`/api/campaigns/${campaign.campaignId}/places`, page.url()).toString(),
      {
        data: {
          name: parentName,
          kind: "station",
          description: `Saved parent description ${timestamp}.`,
          playerNotesMarkdown: "",
          gmNotesMarkdown: "",
          parentPlaceId: null,
          artSubject: "",
          artPath: null,
          artPrompt: null,
          artProvider: null,
        },
      },
    );
    expect(createParentResponse.ok()).toBeTruthy();
    const parentPayload = (await createParentResponse.json()) as { place?: { id?: string } };
    parentId = parentPayload.place?.id ?? null;
    if (!parentId) throw new Error("The E2E art-session parent Place was not created.");
    createdPlaceIds.push(parentId);

    await page.route(`**/api/campaigns/${campaign.campaignId}/visual-styles`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ styles: [{ id: visualStyleId, name: "Neon Cartography", status: "ready" }] }),
      });
    });

    await page.route("**/api/ai/image**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "POST" && pathname === "/api/ai/image") {
        const body = request.postDataJSON() as ImageRequestBody;
        imageRequests.push(body);
        const runId = `00000000-0000-4000-8000-${String(imageRequests.length).padStart(12, "0")}`;
        const temporaryPath = `${campaign.campaignId}/00000000-0000-4000-8000-000000000092/image-${runId}.png`;
        temporaryPaths.push(temporaryPath);
        drafts.set(runId, {
          model: `openai/gpt-image-${imageRequests.length}`,
          createdAt: new Date(Date.now() + imageRequests.length * 1000).toISOString(),
          temporaryPath,
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            draft: {
              generationRunId: runId,
              targetKind: body.targetKind,
              purpose: "entity-art",
              mode: body.mode,
              subject: body.subject,
              aspectRatio: "1:1",
              size: "1024x1024",
              prompt: `Image prompt ${imageRequests.length}`,
              provider: "openrouter",
              model: drafts.get(runId)!.model,
              image: { base64: pixelPng, url: null, mediaType: "image/png" },
              createdAt: drafts.get(runId)!.createdAt,
              temporaryPath,
            },
          }),
        });
        return;
      }

      if (request.method() === "GET") {
        const runId = pathname.split("/").at(-1) ?? "";
        statusRunIds.push(runId);
        const metadata = drafts.get(runId);
        if (!metadata) {
          await route.fulfill({ status: 404, json: { error: "Image generation job was not found." } });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            job: {
              generationRunId: runId,
              status: "complete",
              targetKind: "place",
              purpose: "entity-art",
              mode: "create",
              model: metadata.model,
              createdAt: metadata.createdAt,
              temporaryPath: metadata.temporaryPath,
              image: { base64: null, url: `data:image/png;base64,${pixelPng}`, mediaType: "image/png" },
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.route(`**/api/campaigns/${campaign.campaignId}/art**`, async (route) => {
      if (route.request().method() === "DELETE") {
        deletedTemporaryPaths.push(new URL(route.request().url()).searchParams.get("path") ?? "");
        await route.fulfill({ status: 204 });
        return;
      }
      await route.continue();
    });

    await page.goto(`/campaigns/${campaign.campaignId}/places/${parentId}`);
    await page.getByRole("button", { name: `Add child under ${parentName}`, exact: true }).click();
    const placeForm = page.locator("form.character-form");
    await placeForm.getByLabel("Name").fill(childName);
    await placeForm.getByLabel("Kind").fill("room");
    await page.getByRole("button", { name: "GENERATE ART", exact: true }).click();
    await page.getByLabel("Artwork description").fill("A hidden transit room with blue lanterns.");
    await page.getByLabel("Focused refinement").fill(refinement);
    await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();

    const thumbnails = page.getByRole("button", { name: /Select generated image/ });
    await expect(thumbnails).toHaveCount(1);
    await page.getByLabel("Visual style for image generation").selectOption(visualStyleId);
    await expect(page.getByRole("button", { name: "GENERATE DRAFT", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open generated art preview" })).toBeVisible();
    await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();

    await expect(thumbnails).toHaveCount(2);
    expect(imageRequests).toHaveLength(2);
    expect(imageRequests[1]).toMatchObject({
      mode: "create",
      visualStyleId,
      refinement,
      subject: "A hidden transit room with blue lanterns.",
    });
    expect(Object.prototype.hasOwnProperty.call(imageRequests[1], "currentPrompt")).toBe(false);

    await thumbnails.nth(0).click();
    await expect(thumbnails.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/OPENAI\/GPT-IMAGE-1 \/ 1:1/)).toBeVisible();
    await thumbnails.nth(1).click();
    await expect(thumbnails.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/OPENAI\/GPT-IMAGE-2 \/ 1:1/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileThumbnailGrid = page.getByRole("group", { name: "Generated image drafts" });
    await expect.poll(() => mobileThumbnailGrid.evaluate((element) => getComputedStyle(element).display)).toBe("grid");
    await expect.poll(() => mobileThumbnailGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBeGreaterThan(1);
    expect(await mobileThumbnailGrid.evaluate((element) => getComputedStyle(element).overflowY)).not.toBe("auto");
    await expect.poll(() => page.getByLabel("Artwork description").evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(140);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopThumbnailGrid = page.getByRole("group", { name: "Generated image drafts" });
    await expect.poll(() => desktopThumbnailGrid.evaluate((element) => getComputedStyle(element).display)).toBe("grid");
    expect(await desktopThumbnailGrid.evaluate((element) => getComputedStyle(element).overflowY)).not.toBe("auto");

    const newSessionKey = `${sessionPrefix}${encodeURIComponent(campaign.campaignId)}:place:new`;
    await expect.poll(async () => page.evaluate((key) => sessionStorage.getItem(key), newSessionKey)).toContain("Keep the blue lanterns");
    const storedNewSession = await page.evaluate((key) => {
      const value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) as { drafts: unknown[] } : null;
    }, newSessionKey);
    expect(storedNewSession?.drafts).toHaveLength(2);
    await page.reload();
    await page.getByRole("button", { name: `Add child under ${parentName}`, exact: true }).click();
    const restoredPlaceForm = page.locator("form.character-form");
    await restoredPlaceForm.getByLabel("Name").fill(childName);
    await restoredPlaceForm.getByLabel("Kind").fill("room");
    await page.getByRole("button", { name: "GENERATE ART", exact: true }).click();
    await expect.poll(() => statusRunIds.length).toBeGreaterThanOrEqual(2);
    expect(statusRunIds).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]));
    await expect(page.getByRole("button", { name: /Select generated image/ })).toHaveCount(2);
    await expect(page.getByLabel("Focused refinement")).toHaveValue(refinement);
    await expect(page.getByLabel("Visual style for image generation")).toHaveValue(visualStyleId);

    const saveResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && response.url().endsWith(`/api/campaigns/${campaign.campaignId}/places`),
    );
    await page.getByRole("button", { name: "SAVE PLACE", exact: true }).click();
    const savedResponse = await saveResponse;
    expect(savedResponse.ok()).toBeTruthy();
    const savedPayload = (await savedResponse.json()) as { place?: { id?: string } };
    const savedPlaceId = savedPayload.place?.id;
    if (!savedPlaceId) throw new Error("The E2E art-session child Place was not saved.");
    createdPlaceIds.push(savedPlaceId);

    await expect.poll(async () => page.evaluate((key) => sessionStorage.getItem(key), `${sessionPrefix}${encodeURIComponent(campaign.campaignId)}:place:${savedPlaceId}`)).toContain(refinement);
    const savedSession = await page.evaluate((key) => {
      const value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) as { drafts: unknown[]; refinement: string } : null;
    }, `${sessionPrefix}${encodeURIComponent(campaign.campaignId)}:place:${savedPlaceId}`);
    expect(savedSession).toMatchObject({ drafts: [], refinement });
    await expect.poll(() => deletedTemporaryPaths.length).toBe(2);
    expect(deletedTemporaryPaths).toEqual(expect.arrayContaining(temporaryPaths));
  } finally {
    for (const placeId of [...createdPlaceIds].reverse()) {
      await page.request.delete(
        new URL(`/api/campaigns/${campaign.campaignId}/places/${placeId}`, page.url()).toString(),
        { timeout: 5_000 },
      );
    }
  }
});