import { expect, test } from "./fixtures";

type ImageRequestBody = {
  campaignId: string;
  mode: "create" | "refine";
  targetKind: string;
  parentPlaceId?: string;
  subject: string;
  aspectRatio?: string;
  size?: string;
};

test("keeps Place starting details when focusing GM direction", async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) =>
    route.fulfill({ status: 200, json: { status: "live", models: [] } }),
  );
  await page.goto(`/campaigns/${campaign.campaignId}/places`);
  await page.getByRole("button", { name: "ADD ROOT PLACE", exact: true }).click();
  await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();

  const assistant = page.locator("[data-ai-draft-assistant]");
  const name = assistant.getByLabel("Name", { exact: true });
  const kind = assistant.getByLabel("Kind", { exact: true });
  const direction = assistant.getByRole("textbox", { name: "GM direction" });

  await name.fill("The Hollow Crown");
  await kind.fill("space station");
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
  await direction.click();
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
  await direction.fill("A derelict trading post.");
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
  await kind.focus();
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    if (await direction.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(direction).toBeFocused();
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
});

test("keeps prefilled Place details when starting an AI direction", async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) =>
    route.fulfill({ status: 200, json: { status: "live", models: [] } }),
  );
  await page.goto(`/campaigns/${campaign.campaignId}/places`);
  await page.getByRole("button", { name: "ADD ROOT PLACE", exact: true }).click();
  const form = page.locator("form.character-form");
  await form.getByLabel("Name", { exact: true }).fill("The Hollow Crown");
  await form.getByLabel("Kind", { exact: true }).fill("space station");
  await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();

  const assistant = page.locator("[data-ai-draft-assistant]");
  const name = assistant.getByLabel("Name", { exact: true });
  const kind = assistant.getByLabel("Kind", { exact: true });
  const direction = assistant.getByRole("textbox", { name: "GM direction" });
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
  await direction.click();
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
  await direction.fill("A derelict trading post.");
  await expect(name).toHaveValue("The Hollow Crown");
  await expect(kind).toHaveValue("space station");
});

for (const firstAction of ["direction", "source", "brief", "parent", "generate"] as const) {
  test(`preserves Place session context when starting with ${firstAction}`, async ({ page, campaign }) => {
    test.setTimeout(60_000);
    page.setDefaultTimeout(10_000);
    const generationRequests: Array<Record<string, unknown>> = [];
    let releaseGeneration: () => void = () => undefined;
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    let recordMutations = 0;
    await page.route("**/api/ai/models**", (route) =>
      route.fulfill({ status: 200, json: { status: "live", models: [] } }),
    );
    await page.route("**/api/ai/place", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      generationRequests.push(body);
      if (firstAction === "generate") await generationGate;
      await route.fulfill({
        status: 200,
        json: {
          model: "local/mock-model",
          draft: {
            name: body.name,
            kind: body.kind,
            description: "A reviewed place.",
            playerNotes: "",
            gmNotes: "",
            visualPrompt: "",
          },
        },
      });
    });

    await page.goto(`/campaigns/${campaign.campaignId}/places`);
    const parentName = `Session parent ${Date.now()}`;
    await page.getByRole("button", { name: "ADD ROOT PLACE", exact: true }).click();
    const parentForm = page.locator("form.character-form");
    await parentForm.getByLabel("Name", { exact: true }).fill(parentName);
    await parentForm.getByLabel("Kind", { exact: true }).fill("planet");
    const parentResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/campaigns/${campaign.campaignId}/places`)
      && response.request().method() === "POST",
    );
    await parentForm.getByRole("button", { name: "SAVE PLACE", exact: true }).click();
    const parentResponse = await parentResponsePromise;
    expect(parentResponse.ok()).toBeTruthy();
    const parentId = ((await parentResponse.json()) as { place: { id: string } }).place.id;
    page.on("request", (request) => {
      if (request.url().includes(`/api/campaigns/${campaign.campaignId}/places`)
        && ["POST", "PATCH", "DELETE"].includes(request.method())) {
        recordMutations += 1;
      }
    });

    try {
      await page.setViewportSize({ width: firstAction === "direction" ? 390 : 1440, height: 900 });
      await page.getByRole("button", { name: "ADD ROOT PLACE", exact: true }).click();
      const form = page.locator("form.character-form");
      await form.getByLabel("Name", { exact: true }).fill("The Hollow Crown");
      await form.getByLabel("Kind", { exact: true }).fill("space station");
      await form.getByLabel("Parent").selectOption(parentId);
      await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();

      const assistant = page.locator("[data-ai-draft-assistant]");
      const name = assistant.getByLabel("Name", { exact: true });
      const kind = assistant.getByLabel("Kind", { exact: true });
      const parent = assistant.getByLabel("Parent", { exact: true });
      const direction = assistant.getByRole("textbox", { name: "GM direction" });
      await expect(name).toHaveValue("The Hollow Crown");
      await expect(kind).toHaveValue("space station");
      await expect(parent).toHaveValue(parentId);

      if (firstAction === "brief") await name.fill("The New Crown");
      if (firstAction === "parent") await parent.selectOption("");
      await direction.focus();
      await expect(name).toHaveValue(firstAction === "brief" ? "The New Crown" : "The Hollow Crown");
      await expect(kind).toHaveValue("space station");
      await expect(parent).toHaveValue(firstAction === "parent" ? "" : parentId);
      expect(generationRequests).toHaveLength(0);
      expect(recordMutations).toBe(0);
      if (firstAction === "source") {
        await assistant.getByRole("button", { name: "EDIT MARKDOWN SOURCE", exact: true }).click();
        await assistant.getByRole("textbox", { name: "GM direction Markdown source" }).fill("A derelict trading post.");
      } else if (firstAction !== "generate") {
        await direction.fill("A derelict trading post.");
      }
      await expect(name).toHaveValue(firstAction === "brief" ? "The New Crown" : "The Hollow Crown");
      await expect(kind).toHaveValue("space station");
      await expect(parent).toHaveValue(firstAction === "parent" ? "" : parentId);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await assistant.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
      await expect.poll(() => generationRequests.length).toBe(1);
      if (firstAction === "generate") {
        await expect(parent).toBeDisabled();
        releaseGeneration();
      }
      expect(generationRequests[0]).toMatchObject({
        name: firstAction === "brief" ? "The New Crown" : "The Hollow Crown",
        kind: "space station",
        protectedFields: expect.arrayContaining(["name", "kind"]),
      });
      if (firstAction === "parent") {
        expect(generationRequests[0]).not.toHaveProperty("parentPlaceId");
      } else {
        expect(generationRequests[0]).toHaveProperty("parentPlaceId", parentId);
      }
      if (firstAction !== "generate") {
        expect(generationRequests[0]).toHaveProperty("focus", "A derelict trading post.");
      }
      if (firstAction === "direction") {
        await assistant.getByRole("textbox", { name: "Description", exact: true }).fill("A revised place.");
        await parent.selectOption("");
        await expect(assistant.getByRole("button", { name: "USE DRAFT", exact: true })).toBeDisabled();
        await parent.selectOption(parentId);
        await assistant.getByRole("button", { name: "REVISE DRAFT", exact: true }).click();
        await expect.poll(() => generationRequests.length).toBe(2);
        expect(generationRequests[1]).toHaveProperty("mode", "refine");
        await assistant.getByRole("button", { name: "Undo last AI revision" }).click();
        await expect(assistant.getByRole("textbox", { name: "Description", exact: true })).toContainText("A revised place.");
      }
      await assistant.getByRole("button", { name: "USE DRAFT", exact: true }).click();
      await expect(form.getByLabel("Name", { exact: true })).toHaveValue(firstAction === "brief" ? "The New Crown" : "The Hollow Crown");
      await expect(form.getByLabel("Kind", { exact: true })).toHaveValue("space station");
      await expect(form.getByLabel("Parent")).toHaveValue(firstAction === "parent" ? "" : parentId);
      expect(recordMutations).toBe(0);

      if (firstAction === "direction") {
        await form.getByLabel("Name", { exact: true }).fill("Revised Crown");
        await form.getByLabel("Kind", { exact: true }).fill("city");
        await form.getByLabel("Parent").selectOption("");
        await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
        await direction.fill("A second direction.");
        await expect(name).toHaveValue("Revised Crown");
        await expect(kind).toHaveValue("city");
        await expect(parent).toHaveValue("");
      }
    } finally {
      releaseGeneration();
      await page.request.delete(
        new URL(`/api/campaigns/${campaign.campaignId}/places/${parentId}`, page.url()).toString(),
      );
    }
  });
}

test("keeps edits and child context without saving an AI session", async ({ page, campaign }) => {
  test.setTimeout(60_000);
  await page.route("**/api/ai/models**", (route) =>
    route.fulfill({ status: 200, json: { status: "live", models: [] } }),
  );
  await page.goto(`/campaigns/${campaign.campaignId}/places`);
  const placeName = `Existing Place ${Date.now()}`;
  const createResponse = await page.request.post(
    new URL(`/api/campaigns/${campaign.campaignId}/places`, page.url()).toString(),
    { data: { name: placeName, kind: "planet", description: "" } },
  );
  expect(createResponse.ok()).toBeTruthy();
  const placeId = ((await createResponse.json()) as { place: { id: string } }).place.id;
  try {
    await page.goto(`/campaigns/${campaign.campaignId}/places/${placeId}`);
    await page.getByRole("button", { name: `Edit ${placeName}`, exact: true }).click();
    const form = page.locator("form.character-form");
    await form.getByLabel("Name", { exact: true }).fill("Changed Place");
    await form.getByLabel("Kind", { exact: true }).fill("city");
    await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
    const assistant = page.locator("[data-ai-draft-assistant]");
    await assistant.getByRole("textbox", { name: "GM direction" }).fill("A changed direction.");
    await expect(assistant.getByLabel("Name", { exact: true })).toHaveValue("Changed Place");
    await expect(assistant.getByLabel("Kind", { exact: true })).toHaveValue("city");
    await assistant.getByRole("button", { name: "BACK TO EDITOR", exact: true }).click();
    await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Changed Place");
    await expect(form.getByLabel("Kind", { exact: true })).toHaveValue("city");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Close place editor" }).click();

    await page.getByRole("button", { name: `Add child under ${placeName}`, exact: true }).click();
    await form.getByLabel("Name", { exact: true }).fill("Child Place");
    await form.getByLabel("Kind", { exact: true }).fill("room");
    await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
    await assistant.getByRole("textbox", { name: "GM direction" }).fill("A hidden room.");
    await expect(assistant.getByLabel("Name", { exact: true })).toHaveValue("Child Place");
    await expect(assistant.getByLabel("Kind", { exact: true })).toHaveValue("room");
    await expect(assistant.getByLabel("Parent", { exact: true })).toHaveValue(placeId);
  } finally {
    await page.request.delete(
      new URL(`/api/campaigns/${campaign.campaignId}/places/${placeId}`, page.url()).toString(),
    );
  }
});

test("threads the selected Place parent through image generation", async ({
  page,
  campaign,
}) => {
  test.setTimeout(60000);
  const timestamp = Date.now();
  const parentName = `Image Context Parent ${timestamp}`;
  const childName = `Image Context Child ${timestamp}`;
  let createdParentId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/places`);
    const createResponse = await page.request.post(
      new URL(
        `/api/campaigns/${campaign.campaignId}/places`,
        page.url(),
      ).toString(),
      {
        data: {
          name: parentName,
          kind: "station",
          description: `Saved parent description ${timestamp}.`,
          playerNotesMarkdown: `Saved parent notes ${timestamp}.`,
          gmNotesMarkdown: `Private parent notes ${timestamp}.`,
          parentPlaceId: null,
          artSubject: "",
          artPath: null,
          artPrompt: null,
          artProvider: null,
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = (await createResponse.json()) as {
      place?: { id?: string };
    };
    const parentId = createPayload.place?.id;
    if (!parentId) throw new Error("The E2E parent Place was not created.");
    createdParentId = parentId;

    const imageRequests: ImageRequestBody[] = [];
    await page.route("**/api/ai/image", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      const body = route.request().postDataJSON() as ImageRequestBody;
      imageRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            generationRunId: "00000000-0000-4000-8000-000000000001",
            targetKind: body.targetKind,
            mode: body.mode,
            subject: body.subject,
            aspectRatio: body.aspectRatio ?? "1:1",
            size: body.size ?? "1024x1024",
            prompt: `Local image draft for ${body.subject}`,
            provider: "openrouter",
            model: "openai/gpt-image-1",
            image: {
              base64: "aW1hZ2U=",
              url: null,
              mediaType: "image/png",
            },
            createdAt: new Date().toISOString(),
          },
          model: "openai/gpt-image-1",
        }),
      });
    });

    await page.goto(
      `/campaigns/${campaign.campaignId}/places/${parentId}`,
    );
    await page
      .getByRole("button", {
        name: `Add child under ${parentName}`,
        exact: true,
      })
      .click();
    const placeForm = page.locator("form.character-form");
    await expect(placeForm.getByLabel("Parent")).toHaveValue(parentId);
    await placeForm.getByLabel("Name").fill(childName);
    await placeForm.getByLabel("Kind").fill("room");
    await page
      .getByRole("button", { name: "GENERATE ART", exact: true })
      .click();
    await page.getByLabel("Artwork description").fill("A hidden transit room");
    await page
      .getByRole("button", { name: "GENERATE DRAFT", exact: true })
      .click();

    await expect.poll(() => imageRequests.length).toBe(1);
    expect(imageRequests[0]).toMatchObject({
      campaignId: campaign.campaignId,
      targetKind: "place",
      parentPlaceId: parentId,
      subject: "A hidden transit room",
    });

    await placeForm.getByLabel("Parent").selectOption("");
    await expect(
      page.getByRole("button", { name: "GENERATE DRAFT", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "GENERATE DRAFT", exact: true })
      .click();

    await expect.poll(() => imageRequests.length).toBe(2);
    expect(
      Object.prototype.hasOwnProperty.call(imageRequests[1], "parentPlaceId"),
    ).toBe(false);
  } finally {
    if (createdParentId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/places/${createdParentId}`,
          page.url(),
        ).toString(),
      );
    }
  }
});