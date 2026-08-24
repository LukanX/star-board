import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type ArchiveFixture = {
  placeId: string;
  placeName: string;
  npcId: string;
  npcName: string;
  factionId: string;
  factionName: string;
  placePrivateNotes: string;
  npcPrivateNotes: string;
};

async function createArchiveFixture(page: Page, campaignId: string): Promise<ArchiveFixture> {
  const timestamp = Date.now();
  const placeName = `Archive Route Place ${timestamp}`;
  const npcName = `Archive Route NPC ${timestamp}`;
  const factionName = `Archive Route Faction ${timestamp}`;
  const placePrivateNotes = `Place private note ${timestamp}`;
  const npcPrivateNotes = `NPC private note ${timestamp}`;
  const baseUrl = page.url();

  const placeResponse = await page.request.post(
    new URL(`/api/campaigns/${campaignId}/places`, baseUrl).toString(),
    {
      data: {
        name: placeName,
        kind: "station",
        description: `Public place brief ${timestamp}`,
        playerNotesMarkdown: `Public place notes ${timestamp}`,
        gmNotesMarkdown: placePrivateNotes,
        parentPlaceId: null,
        artSubject: "",
        artPath: null,
        artPrompt: null,
        artProvider: null,
      },
    },
  );
  expect(placeResponse.ok()).toBeTruthy();
  const placePayload = (await placeResponse.json()) as { place?: { id?: string } };
  const placeId = placePayload.place?.id;
  expect(placeId).toBeTruthy();

  const npcResponse = await page.request.post(
    new URL(`/api/campaigns/${campaignId}/npcs`, baseUrl).toString(),
    {
      data: {
        name: npcName,
        species: "Android",
        role: "Signal Keeper",
        description: `Public NPC brief ${timestamp}`,
        playerNotesMarkdown: `Public NPC notes ${timestamp}`,
        gmNotesMarkdown: npcPrivateNotes,
        artSubject: "",
        artPath: null,
        artPrompt: null,
        artProvider: null,
        placeId,
      },
    },
  );
  expect(npcResponse.ok()).toBeTruthy();
  const npcPayload = (await npcResponse.json()) as { npc?: { id?: string } };
  const npcId = npcPayload.npc?.id;
  expect(npcId).toBeTruthy();

  const factionResponse = await page.request.post(
    new URL(`/api/campaigns/${campaignId}/factions`, baseUrl).toString(),
    {
      data: {
        name: factionName,
        description: `Public faction brief ${timestamp}`,
        status: "active",
        artSubject: "",
        artPath: null,
        artPrompt: null,
        artProvider: null,
        placeId,
      },
    },
  );
  expect(factionResponse.ok()).toBeTruthy();
  const factionPayload = (await factionResponse.json()) as { faction?: { id?: string } };
  const factionId = factionPayload.faction?.id;
  expect(factionId).toBeTruthy();

  return {
    placeId: placeId!,
    placeName,
    npcId: npcId!,
    npcName,
    factionId: factionId!,
    factionName,
    placePrivateNotes,
    npcPrivateNotes,
  };
}

async function deleteArchiveFixture(page: Page, campaignId: string, fixture: ArchiveFixture) {
  const baseUrl = page.url();
  for (const [section, id] of [
    ["factions", fixture.factionId],
    ["npcs", fixture.npcId],
    ["places", fixture.placeId],
  ] as const) {
    await page.request.delete(
      new URL(`/api/campaigns/${campaignId}/${section}/${id}`, baseUrl).toString(),
    );
  }
}

test("selects archive records locally and opens canonical full records", async ({
  page,
  campaign,
}) => {
  test.setTimeout(60000);
  let fixture: ArchiveFixture | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}`);
    fixture = await createArchiveFixture(page, campaign.campaignId);

    const archiveRoutes = [
      {
        section: "places",
        name: fixture.placeName,
        preview: "[data-place-preview]",
        id: fixture.placeId,
      },
      {
        section: "npcs",
        name: fixture.npcName,
        preview: "[data-npc-preview]",
        id: fixture.npcId,
      },
      {
        section: "factions",
        name: fixture.factionName,
        preview: "[data-faction-preview]",
        id: fixture.factionId,
      },
    ] as const;

    for (const record of archiveRoutes) {
      await page.goto(`/campaigns/${campaign.campaignId}/${record.section}`);
      const sectionUrl = page.url();
      await page.getByRole("button", { name: `Select ${record.name}`, exact: true }).click();
      await expect(page).toHaveURL(sectionUrl);
      await expect(page.locator(record.preview)).toContainText(record.name);

      await page.locator(record.preview).getByRole("link", { name: "OPEN FULL RECORD", exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`/campaigns/${campaign.campaignId}/${record.section}/${record.id}$`),
      );
      await expect(page.getByRole("heading", { name: record.name, exact: true })).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/${record.section}$`));
    }
  } finally {
    if (fixture) await deleteArchiveFixture(page, campaign.campaignId, fixture);
  }
});

test("focuses archive previews on mobile without horizontal overflow", async ({
  page,
  campaign,
}) => {
  let fixture: ArchiveFixture | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}`);
    fixture = await createArchiveFixture(page, campaign.campaignId);
    await page.setViewportSize({ width: 390, height: 844 });

    const archiveRoutes = [
      { section: "places", name: fixture.placeName },
      { section: "npcs", name: fixture.npcName },
      { section: "factions", name: fixture.factionName },
    ] as const;

    for (const record of archiveRoutes) {
      await page.goto(`/campaigns/${campaign.campaignId}/${record.section}`);
      await page.getByRole("button", { name: `Select ${record.name}`, exact: true }).click();
      const heading = page.locator(
        '[data-archive-preview-panel] > [data-archive-preview-heading="true"]',
      );
      await expect(heading).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
      );
    }
  } finally {
    if (fixture) await deleteArchiveFixture(page, campaign.campaignId, fixture);
  }
});

test("hides private Place and NPC notes from players on full records", async ({
  browser,
  page,
  campaign,
}) => {
  let fixture: ArchiveFixture | null = null;
  const playerAuthFile = path.resolve("playwright/.auth/player.json");
  const playerContext = await browser.newContext({ storageState: playerAuthFile });
  const playerPage = await playerContext.newPage();

  try {
    await page.goto(`/campaigns/${campaign.campaignId}`);
    fixture = await createArchiveFixture(page, campaign.campaignId);

    await playerPage.goto(
      `/campaigns/${campaign.campaignId}/places/${fixture.placeId}`,
    );
    await expect(playerPage.getByText(`Public place notes`, { exact: false })).toBeVisible();
    await expect(playerPage.getByText(fixture.placePrivateNotes, { exact: false })).toHaveCount(0);

    await playerPage.goto(
      `/campaigns/${campaign.campaignId}/npcs/${fixture.npcId}`,
    );
    await expect(playerPage.getByText(`Public NPC notes`, { exact: false })).toBeVisible();
    await expect(playerPage.getByText(fixture.npcPrivateNotes, { exact: false })).toHaveCount(0);
  } finally {
    await playerContext.close();
    if (fixture) await deleteArchiveFixture(page, campaign.campaignId, fixture);
  }
});