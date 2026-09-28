import { expect, test } from "./fixtures";

test("edits an entity field with line breaks and selected @ links", async ({ page, campaign }) => {
  test.setTimeout(60_000);
  const campaignId = campaign.campaignId;
  const suffix = Date.now();
  const targetName = `LineTarget${suffix}`;
  const sourceName = `LineSource${suffix}`;
  let targetId: string | null = null;
  let sourceId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaignId}/npcs`);
    const appOrigin = new URL(page.url()).origin;
    const targetResponse = await page.request.post(
      new URL(`/api/campaigns/${campaignId}/npcs`, appOrigin).toString(),
      { data: { name: targetName, description: "The entity mention target." } },
    );
    expect(targetResponse.ok()).toBeTruthy();
    targetId = ((await targetResponse.json()) as { npc?: { id?: string } }).npc?.id ?? null;
    expect(targetId).toBeTruthy();

    await page.getByRole("button", { name: "ADD NPC", exact: true }).click();
    await page.locator("form.character-form").getByLabel("Name", { exact: true }).fill(sourceName);

    const description = page.getByRole("textbox", { name: "Description" });
    await description.fill(`First line\nSecond line @${targetName}`);
    const suggestion = page.getByRole("option", { name: new RegExp(`@${targetName}`) });
    await expect(suggestion).toBeVisible();
    await description.press("ArrowDown");
    await description.press("Enter");
    await description.type(" stays unlinked");

    const saveResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/campaigns/${campaignId}/npcs`)
      && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "SAVE NPC", exact: true }).click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const payload = await saveResponse.json() as { npc?: { id?: string; description?: string; description_is_markdown?: boolean } };
    sourceId = payload.npc?.id ?? null;
    expect(sourceId).toBeTruthy();
    expect(payload.npc?.description_is_markdown).toBe(true);
    expect(payload.npc?.description).toContain("First line");
    expect(payload.npc?.description).toContain("Second line");
    expect(payload.npc?.description).toContain(`[@${targetName}](/campaigns/${campaignId}/npcs/${targetId})`);
    expect(payload.npc?.description).toContain("stays unlinked");

    const previewUrl = new URL(`/api/campaigns/${campaignId}/entities/preview`, appOrigin);
    previewUrl.searchParams.set("section", "npcs");
    previewUrl.searchParams.set("id", targetId ?? "");
    const previewResponse = await page.request.get(previewUrl.toString());
    expect(previewResponse.status()).toBe(200);
    await expect(previewResponse).toBeOK();

    await page.goto(`/campaigns/${campaignId}/npcs/${sourceId}`);
    const brief = page.locator("[data-npc-public-brief]");
    await expect(brief).toContainText("First line");
    await expect(brief).toContainText("Second line");
    await expect(brief.locator(".whitespace-pre-wrap")).toHaveCSS("white-space", "pre-wrap");
    const link = brief.getByRole("link", { name: `@${targetName}` });
    await expect(link).toHaveAttribute("href", `/campaigns/${campaignId}/npcs/${targetId}`);
    await link.hover();
    await expect(page.getByRole("tooltip")).toContainText("The entity mention target.");
    await expect(brief.getByRole("link", { name: /stays unlinked/ })).toHaveCount(0);
  } finally {
    if (sourceId) {
      await page.request.delete(new URL(`/api/campaigns/${campaignId}/npcs/${sourceId}`, "http://127.0.0.1:3100").toString(), { timeout: 10000 });
    }
    if (targetId) {
      await page.request.delete(new URL(`/api/campaigns/${campaignId}/npcs/${targetId}`, "http://127.0.0.1:3100").toString(), { timeout: 10000 });
    }
  }
});
