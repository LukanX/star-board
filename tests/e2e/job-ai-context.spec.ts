import { expect, test } from "./fixtures";

type MissionRequestBody = {
  campaignId: string;
  mode: "create" | "refine";
  styleTags?: string[];
};

function missionDraft(revision: number) {
  return {
    title: `One-off relay mission ${revision}`,
    summary: "A damaged relay is broadcasting an unfamiliar distress signal.",
    playerNotes: "Find the relay and decide who receives help first.",
    gmNotes: "The distress signal is being replayed by a hidden saboteur.",
    hook: "The distress call uses a crew member's voice.",
    suggestedGiverType: "none",
    suggestedGiverName: "",
    thumbnailDescription: "A damaged orbital relay above a blue gas giant.",
  };
}

test("uses temporary custom narrative tags for job generation only", async ({ page, campaign }) => {
  test.setTimeout(60000);
  const requests: MissionRequestBody[] = [];
  let releaseFirstRequest: () => void = () => undefined;
  const firstRequestGate = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });

  await page.route("**/api/ai/models**", (route) =>
    route.fulfill({ status: 200, json: { status: "live", models: [] } }),
  );
  await page.route("**/api/ai/mission", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    requests.push(route.request().postDataJSON() as MissionRequestBody);
    if (requests.length === 1) await firstRequestGate;
    await route.fulfill({
      status: 200,
      json: { draft: missionDraft(requests.length), model: "local/mock-model" },
    });
  });

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/campaigns/${campaign.campaignId}/jobs`);
    await page.getByRole("button", { name: "NEW MISSION" }).click();
    await page.getByRole("button", { name: "OPEN AI WORKSPACE" }).click();

    const campaignTags = page.getByRole("radio", { name: "CAMPAIGN TAGS" });
    const customTags = page.getByRole("radio", { name: "CUSTOM TAGS" });
    await expect(campaignTags).toBeChecked();
    await customTags.check();
    await page.getByRole("checkbox", { name: "Mystery" }).check();
    const customTagInput = page.getByRole("textbox", { name: /CUSTOM TAG/ });
    await customTagInput.fill("mystery");
    await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
    await expect(page.locator('[data-ai-draft-assistant] p[role="alert"]')).toContainText("must be unique, ignoring case");
    expect(requests).toHaveLength(0);
    await customTagInput.fill("Frontier detour");

    const tagControls = page.locator("[data-mission-tag-controls]");
    expect(await tagControls.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

    await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({
      campaignId: campaign.campaignId,
      mode: "create",
      styleTags: ["Mystery", "Frontier detour"],
    });
    await expect(customTags).toBeDisabled();
    await expect(customTagInput).toBeDisabled();
    releaseFirstRequest();
    await expect(page.getByRole("button", { name: "USE DRAFT", exact: true })).toBeVisible();
    await expect(customTagInput).toHaveValue("");

    await customTagInput.fill("Additional cue");
    await customTagInput.press("Enter");
    await expect(page.getByRole("button", { name: "Remove narrative style tag Additional cue" })).toBeVisible();
    expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "Remove narrative style tag Additional cue" }).click();
    await expect(page.getByRole("button", { name: "USE DRAFT", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Remove narrative style tag Frontier detour" }).click();
    await expect(page.getByRole("button", { name: "USE DRAFT", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "REVISE DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({ mode: "refine", styleTags: ["Mystery"] });

    await page.getByRole("button", { name: "NEW DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(3);
    expect(requests[2]).toMatchObject({ mode: "create", styleTags: ["Mystery"] });

    await page.getByRole("checkbox", { name: "Mystery" }).uncheck();
    await page.getByRole("button", { name: "NEW DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(4);
    expect(requests[3]).toMatchObject({ mode: "create", styleTags: [] });

    await page.getByRole("checkbox", { name: "Mystery" }).check();
    await page.getByRole("button", { name: "NEW DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(5);
    expect(requests[4]).toMatchObject({ mode: "create", styleTags: ["Mystery"] });

    await campaignTags.check();
    await page.getByRole("button", { name: "NEW DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(6);
    expect(requests[5]).toMatchObject({ mode: "create" });
    expect(Object.prototype.hasOwnProperty.call(requests[5], "styleTags")).toBe(false);

    await customTags.check();
    await expect(page.getByRole("checkbox", { name: "Mystery" })).toBeChecked();
    await page.locator('[data-ai-draft-assistant] button[aria-label="Back to editor"]').click();
    await page.getByRole("button", { name: "OPEN AI WORKSPACE" }).click();
    await expect(customTags).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Mystery" })).toBeChecked();
    await page.getByRole("button", { name: "NEW DRAFT", exact: true }).click();
    await expect.poll(() => requests.length).toBe(7);
    expect(requests[6]).toMatchObject({ mode: "create", styleTags: ["Mystery"] });

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await tagControls.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

    page.once("dialog", async (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Close mission editor" }).click();
    await page.getByRole("button", { name: "NEW MISSION" }).click();
    await page.getByRole("button", { name: "OPEN AI WORKSPACE" }).click();
    await expect(page.getByRole("radio", { name: "CAMPAIGN TAGS" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Mystery" })).toHaveCount(0);
  } finally {
    releaseFirstRequest();
  }
});