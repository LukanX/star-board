import { expect, test } from "./fixtures";

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
