import { expect, test } from "./fixtures";

test("persists unassigned missions and supports assigning and clearing both giver kinds", async ({ page, campaign }) => {
  test.setTimeout(60000);
  const base = `/api/campaigns/${campaign.campaignId}`;
  const title = `Optional giver mission ${Date.now()}`;
  let jobId: string | undefined;
  let npcId: string | undefined;
  let factionId: string | undefined;

  try {
    const npcResponse = await page.request.post(`${base}/npcs`, { data: { name: `${title} NPC` } });
    expect(npcResponse.ok()).toBeTruthy();
    npcId = ((await npcResponse.json()) as { npc: { id: string } }).npc.id;
    const factionResponse = await page.request.post(`${base}/factions`, { data: { name: `${title} faction` } });
    expect(factionResponse.ok()).toBeTruthy();
    factionId = ((await factionResponse.json()) as { faction: { id: string } }).faction.id;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/campaigns/${campaign.campaignId}/jobs`);
    await page.getByRole("button", { name: "NEW MISSION" }).click();
    await expect(page.getByRole("combobox", { name: "Giver type", exact: true })).toHaveValue("none");
    await expect(page.getByRole("combobox", { name: "Giver", exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("open");

    await page.route("**/api/ai/models**", (route) => route.fulfill({ status: 200, json: { status: "live", models: [] } }));
    await page.route("**/api/ai/mission", async (route) => {
      const input = route.request().postDataJSON() as { giverType: string; giverId?: string };
      expect(input.giverType).toBe("none");
      expect(input.giverId).toBeUndefined();
      await route.fulfill({ status: 200, json: { draft: {
        title, summary: "Investigate a signal without a designated giver.",
        playerNotes: "Explore the relay.", gmNotes: "A private complication.",
        hook: "The signal repeats.", suggestedGiverType: "none", suggestedGiverName: "",
        thumbnailDescription: "An abandoned relay.",
      }, model: "local/mock-model" } });
    });
    await page.getByRole("button", { name: "OPEN AI WORKSPACE" }).click();
    await expect(page.getByRole("combobox", { name: "GIVER TYPE", exact: true })).toHaveValue("none");
    await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
    await page.getByRole("button", { name: "USE DRAFT", exact: true }).click();
    const savedResponse = page.waitForResponse((response) => response.url().endsWith(`${base}/jobs`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "SAVE MISSION" }).click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(201);
    jobId = ((await saved.json()) as { job: { id: string } }).job.id;
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(page.getByText("No designated giver", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("No designated giver", { exact: true })).toBeVisible();
    await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [type, id, name] of [
      ["npc", npcId, `${title} NPC`],
      ["faction", factionId, `${title} faction`],
    ]) {
      await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
      await page.getByRole("combobox", { name: "Giver type", exact: true }).selectOption(type);
      await page.getByRole("combobox", { name: "Giver", exact: true }).selectOption(id);
      await page.getByRole("button", { name: "SAVE MISSION" }).click();
      await expect(page.locator("[data-editor-panel]")).toHaveCount(0);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
      await page.getByRole("combobox", { name: "Giver type", exact: true }).selectOption("none");
      await page.getByRole("button", { name: "SAVE MISSION" }).click();
      await expect(page.locator("[data-editor-panel]")).toHaveCount(0);
      await expect(page.getByText("No designated giver", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("No designated giver", { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    if (jobId) expect((await page.request.delete(`${base}/jobs?jobId=${jobId}`)).ok()).toBeTruthy();
    if (npcId) expect((await page.request.delete(`${base}/npcs/${npcId}`)).ok()).toBeTruthy();
    if (factionId) expect((await page.request.delete(`${base}/factions/${factionId}`)).ok()).toBeTruthy();
  }
});
