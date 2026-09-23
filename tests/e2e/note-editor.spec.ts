import { expect, test } from "./fixtures";

test("formats a campaign note and inserts a canonical entity link with @ search", async ({ page, campaign }) => {
  const campaignId = campaign.campaignId;
  const suffix = Date.now();
  const npcName = `MentionTarget${suffix}`;
  const noteTitle = `Visual note ${suffix}`;
  const npcImageUrl = "https://example.test/note-preview.png";
  let npcId: string | null = null;
  let noteId: string | null = null;

  try {
    await page.route(npcImageUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eX8AAAAASUVORK5CYII=", "base64"),
      });
    });
    await page.goto(`/campaigns/${campaignId}/notes`);
    const npcResponse = await page.request.post(
      new URL(`/api/campaigns/${campaignId}/npcs`, page.url()).toString(),
      { data: { name: npcName, description: "A weathered contact stationed at the outer relay.", artPath: npcImageUrl } },
    );
    expect(npcResponse.ok()).toBeTruthy();
    const npcPayload = (await npcResponse.json()) as { npc?: { id?: string } };
    npcId = npcPayload.npc?.id ?? null;
    expect(npcId).toBeTruthy();
    const searchUrl = new URL(`/api/campaigns/${campaignId}/entities/search`, page.url());
    searchUrl.searchParams.set("q", npcName);
    searchUrl.searchParams.set("audience", "player");
    const searchResponse = await page.request.get(searchUrl.toString());
    expect(searchResponse.ok()).toBeTruthy();
    const searchPayload = await searchResponse.json() as { entities?: Array<{ id: string; label: string }> };
    expect(searchPayload.entities).toContainEqual(expect.objectContaining({ id: npcId, label: npcName }));

    await page.getByRole("button", { name: "ADD NOTE", exact: true }).click();
    await page.getByLabel("Title").fill(noteTitle);

    const body = page.locator("[data-note-rich-editor] .ProseMirror");
    await body.fill("Verified signal");
    await body.press("Control+A");
    await page.getByLabel("Text style").selectOption("2");
    await expect(body.locator("h2")).toHaveText("Verified signal");
    await body.press("Control+A");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await expect(body.locator("h2 strong")).toHaveText("Verified signal");

    await body.press("End");
    await body.press("Enter");
    await expect(body.locator("h2 strong")).toHaveText("Verified signal");
    await body.type(`Filed by @${npcName}`);
    await expect(body.locator("h2 strong")).toHaveText("Verified signal");
    const suggestion = page.getByRole("option", { name: new RegExp(`@${npcName}`) });
    await expect(suggestion).toBeVisible();
    await body.press("ArrowDown");
    await body.press("Enter");
    await expect(body.locator("h2 strong")).toHaveText("Verified signal");
    await body.type(" follow-up text");

    const saveResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/campaigns/${campaignId}/notes`)
      && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "SAVE NOTE" }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const savedPayload = await saveResponse.json() as { note?: { id?: string; body_markdown?: string } };
    noteId = savedPayload.note?.id ?? null;
    expect(noteId).toBeTruthy();
    expect(savedPayload.note?.body_markdown).toContain("Verified signal");
    const noteLink = page.getByRole("link", { name: `Open note ${noteTitle}` });
    await expect(noteLink).toBeVisible();
    await noteLink.click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/notes/[^/]+$`));

    const renderedBody = page.locator(".markdown-content");
    await expect(renderedBody.locator("h2 strong")).toHaveText("Verified signal");
    const entityLink = renderedBody.getByRole("link", { name: `@${npcName}` });
    await expect(entityLink).toHaveAttribute("href", `/campaigns/${campaignId}/npcs/${npcId}`);
    await entityLink.hover();
    const entityTooltip = page.getByRole("tooltip");
    await expect(entityTooltip).toContainText("A weathered contact stationed at the outer relay.");
    await expect(entityTooltip.getByRole("img", { name: `${npcName} artwork` })).toBeVisible();
    await expect(entityLink).toHaveCSS("text-decoration-line", "underline");
    const tooltipBox = await entityTooltip.boundingBox();
    const imageFrame = entityTooltip.locator("[data-entity-preview-image]");
    const briefPanel = entityTooltip.locator("[data-entity-preview-brief]");
    const imageBox = await imageFrame.boundingBox();
    const briefBox = await briefPanel.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(briefBox).not.toBeNull();
    expect(tooltipBox?.width ?? 0).toBeGreaterThanOrEqual(500);
    expect(Math.abs((imageBox?.width ?? 0) - 112)).toBeLessThanOrEqual(1);
    expect(Math.abs((imageBox?.height ?? 0) - 112)).toBeLessThanOrEqual(1);
    expect((briefBox?.x ?? 0)).toBeGreaterThan((imageBox?.x ?? 0) + (imageBox?.width ?? 0) - 1);
    await expect(entityLink).toHaveText(`@${npcName}`);
    await expect(renderedBody).toContainText("follow-up text");
    await expect(renderedBody.getByRole("link", { name: /follow-up text/ })).toHaveCount(0);

    await page.reload();
    await expect(page.locator(".markdown-content h2 strong")).toHaveText("Verified signal");
    await expect(page.locator(".markdown-content").getByRole("link", { name: `@${npcName}` })).toHaveAttribute("href", `/campaigns/${campaignId}/npcs/${npcId}`);
    await expect(page.locator(".markdown-content")).toContainText("follow-up text");
  } finally {
    if (noteId) {
      await page.request.delete(new URL(`/api/campaigns/${campaignId}/notes/${noteId}`, page.url()).toString());
    }
    if (npcId) {
      await page.request.delete(new URL(`/api/campaigns/${campaignId}/npcs/${npcId}`, page.url()).toString());
    }
  }
});