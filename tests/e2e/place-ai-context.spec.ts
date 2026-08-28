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
    await expect(page.getByLabel("Parent")).toHaveValue(parentId);
    await page.getByLabel("Name").fill(childName);
    await page.getByLabel("Kind").fill("room");
    await page
      .getByRole("button", { name: "GENERATE ART", exact: true })
      .click();
    await page.getByLabel("Visual subject").fill("A hidden transit room");
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

    await page.getByLabel("Parent").selectOption("");
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