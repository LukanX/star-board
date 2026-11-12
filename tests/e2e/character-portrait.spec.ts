import { expect, test } from "./fixtures";

test("keeps the portrait direction and review draft without saving the character", async ({ page, campaign }) => {
  const characterName = `Portrait Workspace ${Date.now()}`;
  await page.goto(`/campaigns/${campaign.campaignId}`);
  const createResponse = await page.request.post(
    new URL(`/api/campaigns/${campaign.campaignId}/characters`, page.url()).toString(),
    { data: { name: characterName, species: "Android", className: "Pilot", level: 2 } },
  );
  expect(createResponse.ok()).toBeTruthy();
  const characterId = ((await createResponse.json()) as { character: { id: string } }).character.id;
  let patches = 0;
  let generations = 0;
  page.on("request", (request) => {
    if (request.method() === "PATCH"
      && request.url().endsWith(`/api/campaigns/${campaign.campaignId}/characters/${characterId}`)) patches += 1;
  });
  await page.route("**/api/ai/models**", (route) =>
    route.fulfill({ status: 200, json: { status: "live", models: [] } }),
  );
  await page.route("**/api/ai/character", async (route) => {
    generations += 1;
    await route.fulfill({ status: 200, json: { draft: { visualPrompt: "A pilot with a bright visor." }, model: "local/mock-model" } });
  });

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/characters/${characterId}`);
    await page.getByRole("button", { name: `Edit ${characterName}`, exact: true }).click();
    const workspaceButton = page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true });
    test.skip(await workspaceButton.count() === 0, "Local campaign has no enabled portrait AI capability.");
    await workspaceButton.click();
    const assistant = page.locator("[data-ai-draft-assistant]");
    const direction = assistant.getByRole("textbox", { name: "Image description direction" });
    await direction.fill("A pilot in a flight jacket.");
    await direction.blur();
    await direction.focus();
    await expect(direction).toContainText("A pilot in a flight jacket.");
    expect(generations).toBe(0);
    expect(patches).toBe(0);
    await assistant.getByRole("button", { name: "GENERATE DESCRIPTION", exact: true }).click();
    await expect(assistant.getByLabel("Image description", { exact: true })).toHaveValue("A pilot with a bright visor.");
    await assistant.getByLabel("Image description", { exact: true }).fill("A pilot with a silver visor.");
    await assistant.getByRole("button", { name: "USE DESCRIPTION", exact: true }).click();
    expect(generations).toBe(1);
    expect(patches).toBe(0);
  } finally {
    await page.request.delete(
      new URL(`/api/campaigns/${campaign.campaignId}/characters/${characterId}`, page.url()).toString(),
    );
  }
});

test("keeps saved character artwork on the normal character save boundary", async ({ page, campaign }) => {
  const characterName = `Normal Character Save ${Date.now()}`;
  await page.goto(`/campaigns/${campaign.campaignId}`);
  const createResponse = await page.request.post(
    new URL(`/api/campaigns/${campaign.campaignId}/characters`, page.url()).toString(),
    {
      data: {
        name: characterName,
        species: "Android",
        className: "Pilot",
        level: 2,
        backstoryMarkdown: "A saved character for normal editor coverage.",
        physicalDescription: "A compact pilot with a bright visor.",
      },
    },
  );
  expect(createResponse.ok()).toBeTruthy();
  const createPayload = (await createResponse.json()) as { character?: { id?: string } };
  const characterId = createPayload.character?.id;
  expect(characterId).toBeTruthy();

  let characterPatchCount = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().endsWith(`/api/campaigns/${campaign.campaignId}/characters/${characterId}`)
    ) {
      characterPatchCount += 1;
    }
  });

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/characters/${characterId}`);
    await expect(page.getByRole("button", { name: /GENERATE PORTRAIT/i })).toHaveCount(0);
    await page.getByRole("button", { name: `Edit ${characterName}`, exact: true }).click();
    await expect(page.getByRole("button", { name: "SAVE CHARACTER", exact: true })).toBeVisible();
    await expect(page.getByText("SAVE PORTRAIT", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "GENERATE PORTRAIT", exact: true })).toHaveCount(0);

    await page.getByLabel("Physical appearance").fill("A compact pilot with a brighter visor.");
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/api/campaigns/${campaign.campaignId}/characters/${characterId}`),
    );
    await page.getByRole("button", { name: "SAVE CHARACTER", exact: true }).click();
    await expect((await saveResponsePromise).ok()).toBeTruthy();
    await expect(page.getByRole("button", { name: `Edit ${characterName}`, exact: true })).toBeVisible();
    expect(characterPatchCount).toBe(1);
  } finally {
    await page.request.delete(
      new URL(`/api/campaigns/${campaign.campaignId}/characters/${characterId}`, page.url()).toString(),
    );
  }
});
