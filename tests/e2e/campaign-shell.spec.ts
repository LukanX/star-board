import { expect, test } from "./fixtures";

test("keeps one persistent shell on a direct campaign load and refresh", async ({
  page,
  campaign,
}) => {
  const campaignPath = `/campaigns/${campaign.campaignId}`;
  await page.goto(campaignPath);

  await expect(page).toHaveURL(new RegExp(`${campaignPath}$`));

  await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);
  await expect(page.locator("[data-campaign-sidebar]")).toHaveCount(1);
  await expect(page.locator("[data-campaign-topbar]")).toHaveCount(1);
  const panelTopline = page.locator(".panel-topline").first();
  await expect(panelTopline).toHaveClass(/flex/);
  await expect(panelTopline).toHaveClass(/px-\[21px\]/);

  await page.goto(campaignPath);
  await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);
  await expect(page.locator("[data-campaign-sidebar]")).toHaveCount(1);
  await expect(page.locator("[data-campaign-topbar]")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);
  await expect(page.locator("[data-campaign-sidebar]")).toHaveCount(1);
  await expect(page.locator("[data-campaign-topbar]")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    campaign.campaignName,
  );
});

test("preserves mobile navigation and content spacing", async ({
  page,
  campaign,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/campaigns/${campaign.campaignId}`);

  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await expect(page.locator("[data-campaign-content-frame]")).toHaveCSS(
    "padding-left",
    "16px",
  );
  const sidebar = page.locator("[data-campaign-sidebar]");
  await expect(sidebar).toHaveClass(/max-\[760px\]:-translate-x-\[105%\]/);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(sidebar).toHaveClass(/max-\[760px\]:translate-x-0/);
  await expect(sidebar).not.toHaveClass(/sidebar-open/);
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(sidebar).toHaveClass(/max-\[760px\]:-translate-x-\[105%\]/);
});

test("preserves campaign AI settings action sizing", async ({
  page,
  campaign,
}) => {
  await page.goto(`/campaigns/${campaign.campaignId}/settings`);

  const saveButton = page.getByRole("button", {
    name: "SAVE MODEL ACCESS",
    exact: true,
  });
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toHaveClass(/min-w-\[166px\]/);
  await expect(saveButton).toHaveCSS("min-width", "166px");
});

test("preserves campaign creation action sizing", async ({ page }) => {
  await page.goto("/campaigns");

  const createButton = page.getByRole("button", {
    name: "CREATE CAMPAIGN",
    exact: true,
  });
  await expect(createButton).toBeVisible();
  await expect(createButton).toHaveClass(/w-full/);
  await expect(createButton).toHaveClass(/mt-\[10px\]/);
  await expect(createButton).toHaveCSS("width", "368px");
  await expect(createButton).toHaveCSS("margin-top", "10px");
});

test("preserves mobile campaign join-link action placement", async ({
  page,
  campaign,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(
    `**/api/campaigns/${campaign.campaignId}/join-links`,
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          joinUrl: `http://127.0.0.1:3100/join/${"x".repeat(24)}`,
        }),
        status: 201,
      });
    },
  );
  await page.goto(`/campaigns/${campaign.campaignId}/members`);

  await page
    .getByRole("button", { name: "CREATE JOIN LINK", exact: true })
    .click();
  const copyButton = page.getByRole("button", {
    name: "COPY LINK",
    exact: true,
  });
  await expect(copyButton).toBeVisible();
  await expect(copyButton).toHaveClass(/ml-auto/);
  await expect(copyButton).toHaveClass(/max-\[760px\]:ml-\[55px\]/);
  await expect(copyButton).toHaveCSS("margin-left", "55px");
  const joinLink = page.locator("[data-member-join-link]");
  await expect(joinLink).toBeVisible();
  await expect(joinLink).toHaveClass(/flex/);
  await expect(joinLink).toHaveClass(/items-center/);
  await expect(joinLink).toHaveClass(/gap-\[14px\]/);
  await expect(joinLink).toHaveClass(/mt-\[20px\]/);
  await expect(joinLink).toHaveClass(/p-\[18px\]/);
  await expect(joinLink).toHaveClass(/border-\[rgba\(98,232,255,\.24\)\]/);
  await expect(joinLink).toHaveClass(/bg-\[rgba\(98,232,255,\.05\)\]/);
  await expect(joinLink).toHaveClass(/max-\[760px\]:items-start/);
  await expect(joinLink).toHaveClass(/max-\[760px\]:flex-wrap/);
  await expect(joinLink).not.toHaveClass(/join-link-card/);
  const joinLinkIcon = joinLink.locator("[data-member-join-link-icon]");
  await expect(joinLinkIcon).toHaveClass(/w-\[39px\]/);
  await expect(joinLinkIcon).toHaveClass(/h-\[39px\]/);
  await expect(joinLinkIcon).toHaveClass(/flex-\[0_0_39px\]/);
  await expect(joinLinkIcon).toHaveClass(/text-\[var\(--cyan\)\]/);
  await expect(joinLinkIcon).toHaveClass(/border-\[rgba\(98,232,255,\.4\)\]/);
  await expect(joinLink.getByRole("heading", { level: 3 })).toHaveClass(
    /text-\[var\(--cyan\)\]/,
  );
  await expect(joinLink.getByRole("heading", { level: 3 })).toHaveClass(
    /font-mono/,
  );
  await expect(joinLink.getByRole("heading", { level: 3 })).toHaveClass(
    /max-\[760px\]:text-\[10px\]/,
  );
});

test("keeps the Places toolbar in route-owned utilities", async ({
  page,
  campaign,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/campaigns/${campaign.campaignId}/places`);

  const toolbar = page.locator("[data-places-toolbar]");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveClass(/flex/);
  await expect(toolbar).toHaveClass(/items-end/);
  await expect(toolbar).toHaveClass(/justify-between/);
  await expect(toolbar).toHaveClass(/gap-\[20px\]/);
  await expect(toolbar).toHaveClass(/mb-\[18px\]/);
  await expect(toolbar).toHaveClass(/p-\[15px_17px\]/);
  await expect(toolbar).toHaveClass(/border/);
  await expect(toolbar).toHaveClass(/border-\[var\(--line\)\]/);
  await expect(toolbar).toHaveClass(/bg-\[linear-gradient/);
  await expect(toolbar).toHaveClass(/max-\[760px\]:items-stretch/);
  await expect(toolbar).toHaveClass(/max-\[760px\]:flex-col/);
  await expect(toolbar).toHaveClass(/max-\[760px\]:gap-\[15px\]/);
  await expect(toolbar).toHaveClass(/max-\[760px\]:p-\[14px\]/);
  await expect(toolbar).toHaveClass(/max-\[420px\]:p-\[12px\]/);
  await expect(toolbar).not.toHaveClass(/places-toolbar/);

  const heading = toolbar.locator("[data-places-toolbar-heading]");
  await expect(heading).toHaveClass(/grid/);
  await expect(heading).toHaveClass(/gap-\[7px\]/);
  await expect(heading.locator("p")).toHaveClass(/m-0/);
  await expect(heading.locator("strong")).toHaveClass(/text-\[var\(--ink\)\]/);
  await expect(heading.locator("strong")).toHaveClass(/text-\[13px\]/);
  await expect(heading.locator("strong")).toHaveClass(/font-\[550\]/);
  await expect(heading).not.toHaveClass(/places-toolbar-heading/);

  const search = toolbar.locator("[data-places-search]");
  await expect(search).toHaveClass(/grid/);
  await expect(search).toHaveClass(/gap-\[7px\]/);
  await expect(search).toHaveClass(/w-\[min\(100%,330px\)\]/);
  await expect(search).toHaveClass(/text-\[var\(--dim\)\]/);
  await expect(search).toHaveClass(/font-mono/);
  await expect(search).toHaveClass(/text-\[8px\]/);
  await expect(search).toHaveClass(/tracking-\[\.12em\]/);
  await expect(search).toHaveClass(/max-\[760px\]:w-full/);
  await expect(search).not.toHaveClass(/places-search/);

  const input = search.locator("input");
  await expect(input).toHaveClass(/w-full/);
  await expect(input).toHaveClass(/h-\[36px\]/);
  await expect(input).toHaveClass(/border/);
  await expect(input).toHaveClass(/border-\[rgba\(139,151,169,\.28\)\]/);
  await expect(input).toHaveClass(/outline-0/);
  await expect(input).toHaveClass(/p-\[0_10px\]/);
  await expect(input).toHaveClass(/bg-\[#0a1118\]/);
  await expect(input).toHaveClass(/text-\[var\(--ink\)\]/);
  await expect(input).toHaveClass(/font-mono/);
  await expect(input).toHaveClass(/text-\[10px\]/);
  await expect(input).toHaveClass(/focus:border-\[var\(--cyan\)\]/);
  await expect(input).toHaveClass(
    /focus:shadow-\[0_0_0_2px_rgba\(98,232,255,\.1\)\]/,
  );
  await expect(input).toHaveClass(/placeholder:text-\[#4d5a6b\]/);
});

test("keeps faction emblems in route-owned utilities", async ({
  page,
  campaign,
}) => {
  const factionName = `Emblem Contract ${Date.now()}`;
  let createdFactionId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/factions`);
    await page
      .getByRole("button", { name: "ADD FACTION", exact: true })
      .click();
    await page.getByLabel("Name").fill(factionName);
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .endsWith(`/api/campaigns/${campaign.campaignId}/factions`),
    );
    await page
      .locator("form.character-form")
      .getByRole("button", { name: "ADD FACTION", exact: true })
      .click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBeTruthy();
    const savePayload = (await saveResponse.json()) as {
      faction?: { id?: string };
    };
    createdFactionId = savePayload.faction?.id ?? null;

    const emblem = page.locator(`[aria-label="${factionName} emblem"]`);
    await expect(emblem).toBeVisible();
    await expect(emblem).toHaveClass(/overflow-hidden/);
    await expect(emblem).toHaveClass(/w-\[64px\]/);
    await expect(emblem).toHaveClass(/h-\[64px\]/);
    await expect(emblem).toHaveClass(/flex-\[0_0_64px\]/);
    await expect(emblem).toHaveClass(/bg-\[repeating-linear-gradient/);
    await expect(emblem.locator("svg")).toHaveClass(/opacity-75/);
    await expect(emblem).toHaveCSS("width", "64px");
    await expect(emblem).toHaveCSS("height", "64px");

    const factionGrid = page.locator("[data-faction-grid]");
    await expect(factionGrid).toHaveClass(/grid/);
    await expect(factionGrid).toHaveClass(/grid-cols-3/);
    await expect(factionGrid).toHaveClass(/gap-\[14px\]/);
    await expect(factionGrid).toHaveClass(/max-\[760px\]:grid-cols-2/);
    await expect(factionGrid).toHaveClass(/max-\[760px\]:gap-\[9px\]/);
    await expect(factionGrid).toHaveClass(/max-\[420px\]:grid-cols-1/);
    await expect(factionGrid).not.toHaveClass(/faction-grid/);

    const factionCard = page.locator(
      `a[aria-label="Open public file for ${factionName}"]`,
    );
    await expect(factionCard).toHaveClass(/relative/);
    await expect(factionCard).toHaveClass(/min-h-\[202px\]/);
    await expect(factionCard).toHaveClass(/p-\[18px\]/);
    await expect(factionCard).toHaveClass(/overflow-hidden/);
    await expect(factionCard).toHaveClass(/border-\[var\(--line\)\]/);
    await expect(factionCard).toHaveClass(/bg-\[var\(--panel\)\]/);
    await expect(factionCard).toHaveClass(/after:content-/);
    await expect(factionCard).toHaveClass(/after:absolute/);
    await expect(factionCard).toHaveClass(/after:-right-8/);
    await expect(factionCard).toHaveClass(/after:-bottom-\[34px\]/);
    await expect(factionCard).toHaveClass(/after:w-\[115px\]/);
    await expect(factionCard).toHaveClass(/after:h-\[115px\]/);
    await expect(factionCard).toHaveClass(/after:border-current/);
    await expect(factionCard).toHaveClass(/after:opacity-\[\.14\]/);
    await expect(factionCard).toHaveClass(/after:rotate-45/);
    await expect(factionCard).not.toHaveClass(/faction-card/);
    const factionTop = factionCard.locator("[data-faction-top]");
    await expect(factionTop).toHaveClass(/flex/);
    await expect(factionTop).toHaveClass(/items-start/);
    await expect(factionTop).toHaveClass(/justify-between/);
    await expect(factionCard.getByRole("heading", { level: 3 })).toHaveClass(
      /max-w-\[190px\]/,
    );
    await expect(factionCard.getByRole("heading", { level: 3 })).toHaveClass(
      /mt-\[28px\]/,
    );
    await expect(factionCard.getByRole("heading", { level: 3 })).toHaveClass(
      /mb-\[6px\]/,
    );
    await expect(factionCard.locator("p")).toHaveClass(/m-0/);
    const factionFooter = factionCard.locator("[data-faction-footer]");
    await expect(factionFooter).toHaveClass(/mt-\[19px\]/);
    await expect(factionFooter).toHaveClass(/items-end/);
    await expect(factionFooter).toHaveClass(/justify-between/);

    await page
      .getByRole("link", { name: `Open public file for ${factionName}` })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/campaigns/${campaign.campaignId}/factions/[^/]+$`),
    );
    const publicFactionTop = page.locator("[data-faction-public-top]");
    await expect(publicFactionTop).toHaveClass(/flex/);
    await expect(publicFactionTop).toHaveClass(/items-start/);
    await expect(publicFactionTop).toHaveClass(/justify-between/);
    await expect(publicFactionTop).not.toHaveClass(/faction-top/);
    await expect(
      page.locator(`[aria-label="${factionName} emblem"]`),
    ).toHaveClass(/w-\[64px\]/);
  } finally {
    if (createdFactionId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/factions/${createdFactionId}`,
          page.url(),
        ).toString(),
      );
    }
  }
});

test("keeps character card artwork in route-owned utilities", async ({
  page,
  campaign,
}) => {
  const characterName = `Portrait Contract ${Date.now()}`;
  let createdCharacterId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/characters`);
    const createResponse = await page.request.post(
      new URL(
        `/api/campaigns/${campaign.campaignId}/characters`,
        page.url(),
      ).toString(),
      {
        data: {
          name: characterName,
          species: "Android",
          className: "Scout",
          level: 2,
          physicalDescription: "A compact scout with silver eyes.",
          artSubject: "",
          artPath: null,
          artUrl: null,
          artPrompt: null,
          artProvider: null,
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = (await createResponse.json()) as {
      character?: { id?: string };
    };
    createdCharacterId = createPayload.character?.id ?? null;

    await page.reload();
    const characterGrid = page.locator("[data-character-grid]");
    await expect(characterGrid).toHaveClass(/grid/);
    await expect(characterGrid).toHaveClass(/grid-cols-4/);
    await expect(characterGrid).toHaveClass(/gap-\[14px\]/);
    await expect(characterGrid).toHaveClass(/max-\[1100px\]:grid-cols-2/);
    await expect(characterGrid).toHaveClass(/max-\[760px\]:gap-\[9px\]/);
    await expect(characterGrid).toHaveClass(/max-\[420px\]:grid-cols-1/);
    await expect(characterGrid).not.toHaveClass(/character-grid/);
    const portrait = page.locator(`[aria-label="${characterName} portrait"]`);
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveClass(/relative/);
    await expect(portrait).toHaveClass(/aspect-\[4\/5\]/);
    await expect(portrait).toHaveClass(/bg-contain/);
    await expect(portrait).toHaveClass(/bg-center/);
    await expect(portrait).toHaveClass(/border-b/);
    await expect(portrait).toHaveClass(/after:content-/);

    const characterCard = page
      .locator("[data-character-card]")
      .filter({
        has: page.getByRole("link", {
          name: `View ${characterName} public record`,
        }),
      });
    await expect(characterCard).toHaveClass(/relative/);
    await expect(characterCard).toHaveClass(/rounded-\[8px\]/);
    await expect(characterCard).toHaveClass(/bg-\[#0f1620\]/);
    await expect(characterCard).toHaveClass(/hover:-translate-y-0\.5/);
    await expect(characterCard).not.toHaveClass(/character-card/);
    const cardLink = characterCard.locator("[data-character-card-main]");
    await expect(cardLink).toHaveClass(/block/);
    await expect(cardLink).toHaveClass(/focus-visible:outline-2/);
    const cardOverlay = characterCard.locator("[data-character-overlay]");
    await expect(cardOverlay).toHaveClass(/absolute/);
    await expect(cardOverlay).toHaveClass(/pointer-events-none/);
    await expect(cardOverlay).toHaveClass(/p-\[15px\]/);
    await expect(characterCard.locator("[data-character-copy]")).toHaveClass(
      /mt-auto/,
    );
    await expect(characterCard.getByRole("heading", { level: 3 })).toHaveClass(
      /text-\[18px\]/,
    );

    await page
      .getByRole("link", { name: `View ${characterName} public record` })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/campaigns/${campaign.campaignId}/characters/[^/]+$`),
    );
    const fullPortrait = page.locator(
      `[aria-label="${characterName} full portrait"]`,
    );
    await expect(fullPortrait).toBeVisible();
    await expect(fullPortrait).toHaveClass(/w-full/);
    await expect(fullPortrait).toHaveClass(/h-full/);
    await expect(fullPortrait).toHaveClass(/bg-contain/);
    await expect(fullPortrait).toHaveClass(/bg-center/);

    await page.setViewportSize({ width: 390, height: 844 });
    const publicRecord = page.locator(
      "section[aria-labelledby='character-public-record-title']",
    );
    const mobileColumns = await publicRecord.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
    );
    expect(mobileColumns).toHaveLength(1);
    await expect(publicRecord).toHaveCSS("gap", "17px");
    await expect(publicRecord).toHaveCSS("padding", "17px");
    await expect(page.locator("[data-character-public-portrait]")).toHaveCSS(
      "justify-self",
      "center",
    );
    await expect(page.locator("#character-public-record-title")).toHaveCSS(
      "font-size",
      "22px",
    );
  } finally {
    if (createdCharacterId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/characters/${createdCharacterId}`,
          page.url(),
        ).toString(),
      );
    }
  }
});

test("keeps NPC public detail layout in route-owned utilities", async ({
  page,
  campaign,
}) => {
  const npcName = `Detail Contract Contact ${Date.now()}`;
  let createdNpcId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/npcs`);
    const createResponse = await page.request.post(
      new URL(
        `/api/campaigns/${campaign.campaignId}/npcs`,
        page.url(),
      ).toString(),
      {
        data: {
          name: npcName,
          species: "Android",
          role: "Archivist",
          description: "A deterministic public contact detail contract.",
          playerNotesMarkdown: "The contact keeps careful records.",
          gmNotesMarkdown: "The contact knows more than they admit.",
          artSubject: "",
          artPath: null,
          artPrompt: null,
          artProvider: null,
          placeId: null,
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = (await createResponse.json()) as {
      npc?: { id?: string };
    };
    createdNpcId = createPayload.npc?.id ?? null;
    expect(createdNpcId).toBeTruthy();

    await page.reload();
    const npcCard = page.getByRole("link", {
      name: `Open public file for ${npcName}`,
    });
    await expect(npcCard).toHaveClass(/cursor-pointer/);
    await expect(npcCard).toHaveClass(/hover:bg-\[rgba\(98,232,255,\.045\)\]/);
    await expect(npcCard).toHaveClass(/focus-visible:outline-1/);
    await expect(npcCard).toHaveClass(
      /focus-visible:outline-\[var\(--cyan\)\]/,
    );
    await expect(npcCard).toHaveClass(/focus-visible:outline-offset-\[-1px\]/);
    await expect(npcCard).not.toHaveClass(/npc-record-row/);
    await npcCard.click();
    await expect(page).toHaveURL(
      new RegExp(`/campaigns/${campaign.campaignId}/npcs/[^/]+$`),
    );

    const preview = page.locator("[data-npc-detail-preview]");
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveClass(/grid/);
    await expect(preview).toHaveClass(/grid-cols-\[auto_minmax\(0,1fr\)\]/);
    await expect(preview).toHaveClass(/gap-\[18px\]/);
    await expect(preview).toHaveClass(/items-stretch/);
    await expect(preview).toHaveClass(/max-\[760px\]:grid-cols-1/);
    await expect(preview).not.toHaveClass(/npc-detail-preview/);

    const portrait = page.locator("[data-npc-detail-portrait]");
    await expect(portrait).toHaveClass(/min-w-\[180px\]/);
    await expect(portrait).toHaveClass(/max-w-\[260px\]/);
    await expect(portrait).toHaveClass(/h-full/);
    await expect(portrait).toHaveClass(/aspect-square/);
    await expect(portrait).toHaveClass(/border/);
    await expect(portrait).toHaveClass(/bg-\[#0a1118\]/);
    await expect(portrait).toHaveClass(
      /max-\[760px\]:w-\[min\(100\%,220px\)\]/,
    );
    await expect(portrait).toHaveClass(/max-\[760px\]:min-w-0/);
    await expect(portrait).toHaveClass(/max-\[760px\]:h-auto/);
    await expect(portrait).toHaveClass(/max-\[760px\]:justify-self-start/);
    await expect(portrait).not.toHaveClass(/npc-detail-portrait/);

    const copy = page.locator("[data-npc-detail-copy]");
    await expect(copy).toHaveClass(/min-w-0/);
    await expect(copy).toHaveClass(/grid/);
    await expect(copy).toHaveClass(/gap-3/);
    await expect(copy).not.toHaveClass(/npc-detail-copy/);

    const notes = page.locator("[data-npc-detail-notes]");
    await expect(notes).toHaveClass(/col-span-2/);
    await expect(notes).toHaveClass(/max-\[760px\]:col-span-1/);
    await expect(notes).not.toHaveClass(/npc-detail-notes/);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileColumns = await preview.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
    );
    expect(mobileColumns).toHaveLength(1);
    await expect(portrait).toHaveCSS("width", "220px");
    await expect(portrait).toHaveCSS("height", "220px");
    await expect(portrait).toHaveCSS("min-width", "0px");
    await expect(portrait).toHaveCSS("justify-self", "flex-start");
  } finally {
    if (createdNpcId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/npcs/${createdNpcId}`,
          page.url(),
        ).toString(),
      );
    }
  }
});

test("keeps note card styling in route-owned utilities", async ({
  page,
  campaign,
}) => {
  const noteTitle = `Card Contract Note ${Date.now()}`;
  let createdNoteId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/notes`);
    const createResponse = await page.request.post(
      new URL(
        `/api/campaigns/${campaign.campaignId}/notes`,
        page.url(),
      ).toString(),
      {
        data: {
          title: noteTitle,
          bodyMarkdown: "A deterministic note card contract.",
          visibility: "player",
          episodeId: null,
        },
      },
    );
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = (await createResponse.json()) as {
      note?: { id?: string };
    };
    createdNoteId = createPayload.note?.id ?? null;
    expect(createdNoteId).toBeTruthy();

    await page.reload();
    const notesToolbar = page.locator("[data-notes-toolbar]");
    await expect(notesToolbar).toHaveCount(1);
    await expect(notesToolbar).toHaveClass(/flex/);
    await expect(notesToolbar).toHaveClass(/items-center/);
    await expect(notesToolbar).toHaveClass(/justify-between/);
    await expect(notesToolbar).toHaveClass(/gap-\[15px\]/);
    await expect(notesToolbar).toHaveClass(/border-b/);
    await expect(notesToolbar).toHaveClass(/pb-\[13px\]/);
    await expect(notesToolbar).toHaveClass(/mb-0/);
    await expect(notesToolbar).not.toHaveClass(/notes-toolbar/);

    const filterTabs = notesToolbar.locator("[data-notes-filter-tabs]");
    await expect(filterTabs).toHaveCount(1);
    await expect(filterTabs).toHaveClass(/flex/);
    await expect(filterTabs).toHaveClass(/items-center/);
    await expect(filterTabs).toHaveClass(/gap-\[18px\]/);
    await expect(filterTabs).toHaveClass(/max-\[760px\]:gap-\[6px\]/);
    await expect(filterTabs).not.toHaveClass(/filter-tabs/);

    const allNotesTab = notesToolbar.getByRole("button", { name: /ALL NOTES/ });
    await expect(allNotesTab).toHaveClass(/inline-flex/);
    await expect(allNotesTab).toHaveClass(/items-center/);
    await expect(allNotesTab).toHaveClass(/gap-\[6px\]/);
    await expect(allNotesTab).toHaveClass(/pb-\[5px\]/);
    await expect(allNotesTab).toHaveClass(/border-b/);
    await expect(allNotesTab).toHaveClass(/border-transparent/);
    await expect(allNotesTab).toHaveClass(/font-mono/);
    await expect(allNotesTab).toHaveClass(/text-\[8px\]/);
    await expect(allNotesTab).toHaveClass(/tracking-\[\.12em\]/);
    await expect(allNotesTab).toHaveClass(/cursor-pointer/);
    await expect(allNotesTab).toHaveClass(/border-\[var\(--cyan\)\]/);
    await expect(allNotesTab).toHaveClass(/text-\[var\(--cyan\)\]/);
    await expect(allNotesTab).not.toHaveClass(/filter-tab/);
    await expect(allNotesTab).not.toHaveClass(/filter-tab-active/);

    const gmToggle = notesToolbar.getByRole("button", { name: /GM ONLY/ });
    await expect(gmToggle).toHaveClass(/inline-flex/);
    await expect(gmToggle).toHaveClass(/items-center/);
    await expect(gmToggle).toHaveClass(/gap-\[6px\]/);
    await expect(gmToggle).toHaveClass(/h-\[29px\]/);
    await expect(gmToggle).toHaveClass(/px-\[9px\]/);
    await expect(gmToggle).toHaveClass(/border-\[rgba\(255,92,154,\.32\)\]/);
    await expect(gmToggle).toHaveClass(/bg-\[rgba\(255,92,154,\.07\)\]/);
    await expect(gmToggle).toHaveClass(/text-\[var\(--pink\)\]/);
    await expect(gmToggle).toHaveClass(/font-mono/);
    await expect(gmToggle).toHaveClass(/text-\[8px\]/);
    await expect(gmToggle).toHaveClass(/tracking-\[\.1em\]/);
    await expect(gmToggle).toHaveClass(/cursor-pointer/);
    await expect(gmToggle).not.toHaveClass(/visibility-toggle/);

    await page.getByRole("button", { name: "ADD NOTE", exact: true }).click();
    const noteVisibilityToggle = page.locator("[data-note-visibility-toggle]");
    await expect(noteVisibilityToggle).toHaveCount(1);
    await expect(noteVisibilityToggle).toHaveClass(/inline-flex/);
    await expect(noteVisibilityToggle).toHaveClass(/items-center/);
    await expect(noteVisibilityToggle).toHaveClass(/gap-\[8px\]/);
    await expect(noteVisibilityToggle).toHaveClass(/text-\[var\(--pink\)\]/);
    await expect(noteVisibilityToggle).toHaveClass(/cursor-pointer/);
    await expect(noteVisibilityToggle).not.toHaveClass(
      /note-visibility-toggle/,
    );
    const noteVisibilityInput = noteVisibilityToggle.locator("input");
    await expect(noteVisibilityInput).toHaveClass(/w-\[14px\]/);
    await expect(noteVisibilityInput).toHaveClass(/h-\[14px\]/);
    await expect(noteVisibilityInput).toHaveClass(/accent-\[var\(--pink\)\]/);
    const noteVisibilityLabel = noteVisibilityToggle.locator("span");
    await expect(noteVisibilityLabel).toHaveClass(/inline-flex/);
    await expect(noteVisibilityLabel).toHaveClass(/items-center/);
    await expect(noteVisibilityLabel).toHaveClass(/gap-\[5px\]/);

    const notesList = page.locator("[data-notes-list]");
    await expect(notesList).toHaveCount(1);
    await expect(notesList).toHaveClass(/border/);
    await expect(notesList).toHaveClass(/border-\[var\(--line\)\]/);
    await expect(notesList).toHaveClass(/bg-\[var\(--panel\)\]/);
    await expect(notesList).not.toHaveClass(/notes-list/);

    const noteCard = page.locator("article").filter({ hasText: noteTitle });
    await expect(noteCard).toHaveCount(1);
    await expect(noteCard).toHaveClass(/min-h-\[94px\]/);
    await expect(noteCard).toHaveClass(/flex/);
    await expect(noteCard).toHaveClass(/items-center/);
    await expect(noteCard).toHaveClass(/gap-\[15px\]/);
    await expect(noteCard).toHaveClass(/px-\[18px\]/);
    await expect(noteCard).toHaveClass(/py-\[15px\]/);
    await expect(noteCard).toHaveClass(/border-b/);
    await expect(noteCard).toHaveClass(/last:border-b-0/);
    await expect(noteCard).not.toHaveClass(/note-row/);

    const accent = noteCard.locator("span").first();
    await expect(accent).toHaveClass(/w-\[3px\]/);
    await expect(accent).toHaveClass(/h-\[42px\]/);
    await expect(accent).toHaveClass(/flex-\[0_0_3px\]/);
    await expect(accent).toHaveClass(/shadow-\[0_0_11px_currentColor\]/);
    await expect(accent).not.toHaveClass(/accent-mark/);

    const noteMain = noteCard.locator("div").first();
    await expect(noteMain).toHaveClass(/min-w-0/);
    await expect(noteMain).toHaveClass(/flex-1/);
    await expect(noteMain).not.toHaveClass(/note-main/);

    const noteMeta = noteMain.locator("div").first();
    await expect(noteMeta).toHaveClass(/items-center/);
    await expect(noteMeta).toHaveClass(/gap-3/);
    await expect(noteMeta).toHaveClass(/font-mono/);
    await expect(noteMeta).toHaveClass(/text-\[8px\]/);
    await expect(noteMeta).toHaveClass(/tracking-\[\.1em\]/);
    await expect(noteMeta).not.toHaveClass(/note-meta/);

    const visibility = noteMeta.locator("span").last();
    await expect(visibility).toHaveClass(/inline-flex/);
    await expect(visibility).toHaveClass(/items-center/);
    await expect(visibility).toHaveClass(/gap-1/);
    await expect(visibility).toHaveClass(/text-\[var\(--cyan\)\]/);
    await expect(visibility).not.toHaveClass(/note-visibility/);
    await expect(noteMain.locator("h3")).toHaveClass(/mt-\[10px\]/);
    await expect(noteMain.locator("h3")).toHaveClass(/mb-\[6px\]/);
    await expect(noteMain.locator("h3")).toHaveClass(/text-\[14px\]/);
    await expect(noteMain.locator("p")).toHaveClass(/m-0/);
    await expect(noteMain.locator("p")).toHaveClass(/text-\[10px\]/);
  } finally {
    if (createdNoteId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/notes/${createdNoteId}`,
          page.url(),
        ).toString(),
      );
    }
  }
});

test("keeps job vote states in route-owned utilities", async ({
  page,
  campaign,
}) => {
  const npcName = `Vote Contract Contact ${Date.now()}`;
  const jobTitle = `Vote Contract Job ${Date.now()}`;
  let createdNpcId: string | null = null;
  let createdJobId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/jobs`);
    const npcResponse = await page.request.post(
      new URL(
        `/api/campaigns/${campaign.campaignId}/npcs`,
        page.url(),
      ).toString(),
      {
        data: {
          name: npcName,
          species: "Android",
          role: "Scout",
          description: "A deterministic vote contract contact.",
          playerNotesMarkdown: "",
          gmNotesMarkdown: "",
          artSubject: "",
          artPath: null,
          artPrompt: null,
          artProvider: null,
          placeId: null,
        },
      },
    );
    expect(npcResponse.ok()).toBeTruthy();
    const npcPayload = (await npcResponse.json()) as { npc?: { id?: string } };
    createdNpcId = npcPayload.npc?.id ?? null;
    expect(createdNpcId).toBeTruthy();

    const jobResponse = await page.request.post(
      new URL(
        `/api/campaigns/${campaign.campaignId}/jobs`,
        page.url(),
      ).toString(),
      {
        data: {
          title: jobTitle,
          summary: "A deterministic open job for the vote control contract.",
          playerNotesMarkdown: "",
          gmNotesMarkdown: "",
          hook: "",
          giverType: "npc",
          giverId: createdNpcId,
          placeId: null,
          status: "open",
          artSubject: "",
          artPath: null,
          artPrompt: null,
          artProvider: null,
        },
      },
    );
    expect(jobResponse.ok()).toBeTruthy();
    const jobPayload = (await jobResponse.json()) as { job?: { id?: string } };
    createdJobId = jobPayload.job?.id ?? null;
    expect(createdJobId).toBeTruthy();

    await page.reload();
    const jobsToolbar = page.locator("[data-jobs-toolbar]");
    await expect(jobsToolbar).toHaveCount(1);
    await expect(jobsToolbar).toHaveClass(/flex/);
    await expect(jobsToolbar).toHaveClass(/items-center/);
    await expect(jobsToolbar).toHaveClass(/justify-between/);
    await expect(jobsToolbar).toHaveClass(/gap-\[15px\]/);
    await expect(jobsToolbar).toHaveClass(/border-b/);
    await expect(jobsToolbar).toHaveClass(/pb-\[13px\]/);
    await expect(jobsToolbar).toHaveClass(/mb-\[18px\]/);
    await expect(jobsToolbar).toHaveClass(/max-\[760px\]:flex-col/);
    await expect(jobsToolbar).not.toHaveClass(/view-toolbar/);

    const jobsFilterTabs = jobsToolbar.locator("[data-jobs-filter-tabs]");
    await expect(jobsFilterTabs).toHaveCount(1);
    await expect(jobsFilterTabs).toHaveClass(/flex/);
    await expect(jobsFilterTabs).toHaveClass(/items-center/);
    await expect(jobsFilterTabs).toHaveClass(/gap-\[18px\]/);
    await expect(jobsFilterTabs).toHaveClass(/max-\[760px\]:gap-\[6px\]/);
    await expect(jobsFilterTabs).not.toHaveClass(/filter-tabs/);

    const openJobsTab = jobsToolbar.getByRole("button", { name: /OPEN/ });
    await expect(openJobsTab).toHaveClass(/inline-flex/);
    await expect(openJobsTab).toHaveClass(/items-center/);
    await expect(openJobsTab).toHaveClass(/gap-\[6px\]/);
    await expect(openJobsTab).toHaveClass(/pb-\[5px\]/);
    await expect(openJobsTab).toHaveClass(/border-b/);
    await expect(openJobsTab).toHaveClass(/border-transparent/);
    await expect(openJobsTab).toHaveClass(/font-mono/);
    await expect(openJobsTab).toHaveClass(/text-\[8px\]/);
    await expect(openJobsTab).toHaveClass(/tracking-\[\.12em\]/);
    await expect(openJobsTab).toHaveClass(/cursor-pointer/);
    await expect(openJobsTab).toHaveClass(/border-\[var\(--cyan\)\]/);
    await expect(openJobsTab).toHaveClass(/text-\[var\(--cyan\)\]/);
    await expect(openJobsTab).not.toHaveClass(/filter-tab/);
    await expect(openJobsTab).not.toHaveClass(/filter-tab-active/);

    const jobsGrid = page.locator("[data-jobs-grid]");
    await expect(jobsGrid).toHaveCount(1);
    await expect(jobsGrid).toHaveClass(/grid/);
    await expect(jobsGrid).toHaveClass(/grid-cols-2/);
    await expect(jobsGrid).toHaveClass(/gap-\[15px\]/);
    await expect(jobsGrid).toHaveClass(/max-\[760px\]:grid-cols-1/);
    await expect(jobsGrid).not.toHaveClass(/jobs-grid/);
    const desktopGridColumnCount = await jobsGrid.evaluate((element) => {
      const columns = getComputedStyle(element).gridTemplateColumns.trim();
      return columns.startsWith("repeat(2") ? 2 : columns.split(/\s+/).length;
    });
    expect(desktopGridColumnCount).toBe(2);
    const jobCard = page
      .locator("article")
      .filter({ hasText: jobTitle })
      .first();
    await expect(jobCard).toHaveClass(/block/);
    await expect(jobCard).toHaveClass(/relative/);
    await expect(jobCard).toHaveClass(/overflow-hidden/);
    await expect(jobCard).toHaveClass(/border-b/);
    await expect(jobCard).toHaveClass(/border-\[var\(--line\)\]/);
    await expect(jobCard).toHaveClass(/bg-\[var\(--panel-deep\)\]/);
    await expect(jobCard).toHaveClass(/min-h-\[307px\]/);
    await expect(jobCard).toHaveClass(/max-\[760px\]:min-h-\[300px\]/);
    await expect(jobCard).not.toHaveClass(/mission-card/);
    await expect(jobCard).not.toHaveClass(/mission-compact/);
    await expect(jobCard).toHaveCSS("display", "block");
    await expect(jobCard).toHaveCSS("position", "relative");
    await expect(jobCard).toHaveCSS("min-height", "307px");
    await expect(jobCard).toHaveCSS("overflow", "hidden");
    const missionContent = jobCard.locator("[data-mission-content]");
    await expect(missionContent).toHaveCount(1);
    await expect(missionContent).toHaveClass(/relative/);
    await expect(missionContent).toHaveClass(/z-\[1\]/);
    await expect(missionContent).toHaveClass(/p-\[49px_20px_75px\]/);
    await expect(missionContent).not.toHaveClass(/mission-content/);
    await expect(missionContent).toHaveCSS("padding", "49px 20px 75px");
    const missionSummary = jobCard.locator("[data-mission-summary]");
    await expect(missionSummary).toHaveClass(/max-w-\[500px\]/);
    await expect(missionSummary).not.toHaveClass(/mission-content/);
    await expect(missionSummary).toHaveCSS("max-width", "500px");
    const missionTitle = jobCard.locator("h3");
    await expect(missionTitle).toHaveClass(/m-0/);
    await expect(missionTitle).toHaveClass(/mb-\[7px\]/);
    await expect(missionTitle).toHaveClass(/!text-\[17px\]/);
    await expect(missionTitle).toHaveClass(/tracking-\[-\.02em\]/);
    await expect(missionTitle).toHaveClass(/max-\[760px\]:!text-\[14px\]/);
    await expect(missionTitle).toHaveCSS("font-size", "17px");
    await expect(missionTitle).toHaveCSS("margin-bottom", "7px");
    await expect(missionSummary).toHaveClass(/m-0/);
    await expect(missionSummary).toHaveClass(/text-\[var\(--muted\)\]/);
    await expect(missionSummary).toHaveClass(/text-\[11px\]/);
    await expect(missionSummary).toHaveClass(/leading-\[1\.55\]/);
    await expect(missionSummary).toHaveClass(/max-\[760px\]:text-\[10px\]/);
    await expect(missionSummary).toHaveCSS("margin", "0px");
    await expect(missionSummary).toHaveCSS("font-size", "11px");
    await expect(missionSummary).toHaveCSS("line-height", "17.05px");
    const missionMeta = jobCard.locator("[data-mission-meta]");
    await expect(missionMeta).toHaveCount(1);
    await expect(missionMeta).toHaveClass(/flex/);
    await expect(missionMeta).toHaveClass(/items-center/);
    await expect(missionMeta).toHaveClass(/gap-\[10px\]/);
    await expect(missionMeta).toHaveClass(/mb-\[11px\]/);
    await expect(missionMeta).not.toHaveClass(/mission-meta/);
    await expect(missionMeta).toHaveCSS("display", "flex");
    await expect(missionMeta).toHaveCSS("align-items", "center");
    await expect(missionMeta).toHaveCSS("gap", "10px");
    await expect(missionMeta).toHaveCSS("margin-bottom", "11px");
    const missionFooter = jobCard.locator("[data-mission-footer]");
    await expect(missionFooter).toHaveCount(1);
    await expect(missionFooter).toHaveClass(/flex/);
    await expect(missionFooter).toHaveClass(/items-end/);
    await expect(missionFooter).toHaveClass(/justify-between/);
    await expect(missionFooter).toHaveClass(/gap-\[10px\]/);
    await expect(missionFooter).toHaveClass(/mt-\[25px\]/);
    await expect(missionFooter).not.toHaveClass(/mission-footer/);
    await expect(missionFooter).toHaveCSS("display", "flex");
    await expect(missionFooter).toHaveCSS("align-items", "flex-end");
    await expect(missionFooter).toHaveCSS("margin-top", "25px");
    const giver = jobCard.locator("[data-giver]");
    await expect(giver).toHaveClass(/flex/);
    await expect(giver).toHaveClass(/items-center/);
    await expect(giver).toHaveClass(/gap-2/);
    await expect(giver).toHaveClass(/min-w-0/);
    await expect(giver).not.toHaveClass(/giver/);
    const giverLabel = giver.locator("[data-giver-label]");
    await expect(giverLabel).toHaveClass(/text-\[var\(--dim\)\]/);
    await expect(giverLabel).toHaveClass(/font-mono/);
    await expect(giverLabel).toHaveClass(/text-\[7px\]/);
    await expect(giverLabel).toHaveClass(/tracking-\[\.11em\]/);
    await expect(giverLabel).toHaveCSS("font-size", "7px");
    const giverName = giver.locator("[data-giver-name]");
    await expect(giverName).toHaveClass(/block/);
    await expect(giverName).toHaveClass(/max-w-\[150px\]/);
    await expect(giverName).toHaveClass(/overflow-hidden/);
    await expect(giverName).toHaveClass(/text-\[\#cfd8e5\]/);
    await expect(giverName).toHaveClass(/text-\[10px\]/);
    await expect(giverName).toHaveClass(/font-\[560\]/);
    await expect(giverName).toHaveClass(/text-ellipsis/);
    await expect(giverName).toHaveClass(/whitespace-nowrap/);
    await expect(giverName).toHaveClass(/mt-\[3px\]/);
    await expect(giverName).toHaveCSS("display", "block");
    await expect(giverName).toHaveCSS("max-width", "150px");
    await expect(giverName).toHaveCSS("font-size", "10px");
    await expect(giverName).toHaveCSS("margin-top", "3px");
    const editButton = jobCard.getByRole("button", {
      name: `Edit ${jobTitle}`,
    });
    await expect(editButton).toHaveClass(/absolute/);
    await expect(editButton).toHaveClass(/top-auto/);
    await expect(editButton).toHaveClass(/right-\[8px\]/);
    await expect(editButton).toHaveClass(/bottom-\[74px\]/);
    await expect(editButton).not.toHaveClass(/mission-more/);
    await expect(editButton).not.toHaveClass(/mission-promote/);
    await expect(editButton).toHaveCSS("position", "absolute");
    await expect(editButton).toHaveCSS("right", "8px");
    await expect(editButton).toHaveCSS("bottom", "74px");
    const promoteButton = jobCard.getByRole("button", {
      name: `Promote ${jobTitle} to an episode`,
    });
    await expect(promoteButton).toHaveClass(/absolute/);
    await expect(promoteButton).toHaveClass(/top-auto/);
    await expect(promoteButton).toHaveClass(/right-\[45px\]/);
    await expect(promoteButton).toHaveClass(/bottom-\[74px\]/);
    await expect(promoteButton).not.toHaveClass(/mission-more/);
    await expect(promoteButton).not.toHaveClass(/mission-promote/);
    await expect(promoteButton).toHaveCSS("position", "absolute");
    await expect(promoteButton).toHaveCSS("right", "45px");
    await expect(promoteButton).toHaveCSS("bottom", "74px");
    const artwork = jobCard.locator(`[aria-label="${jobTitle} artwork"]`);
    await expect(artwork).toBeVisible();
    await expect(artwork).toHaveClass(/absolute/);
    await expect(artwork).toHaveClass(/inset-0/);
    await expect(artwork).toHaveClass(/w-full/);
    await expect(artwork).toHaveClass(/h-full/);
    await expect(artwork).toHaveClass(/opacity-\[\.55\]/);
    await expect(artwork).toHaveClass(/bg-cover/);
    await expect(artwork).toHaveClass(/bg-center/);
    await expect(artwork).toHaveClass(/saturate-\[\.78\]/);
    await expect(artwork).toHaveClass(/contrast-\[1\.08\]/);
    await expect(artwork).not.toHaveClass(/mission-art/);
    const artworkOverlay = jobCard.locator("[data-art-overlay]");
    await expect(artworkOverlay).toHaveCount(1);
    await expect(artworkOverlay).toHaveClass(/absolute/);
    await expect(artworkOverlay).toHaveClass(/inset-0/);
    await expect(artworkOverlay).toHaveClass(/w-full/);
    await expect(artworkOverlay).toHaveClass(/h-full/);
    await expect(artworkOverlay).toHaveClass(/bg-\[linear-gradient/);
    await expect(artworkOverlay).not.toHaveClass(/mission-art-overlay/);
    const missionIndex = jobCard.locator("[data-mission-index]");
    await expect(missionIndex).toHaveCount(1);
    await expect(missionIndex).toHaveText(/^0\d$/);
    await expect(missionIndex).toHaveClass(/z-\[1\]/);
    await expect(missionIndex).toHaveClass(/absolute/);
    await expect(missionIndex).toHaveClass(/top-\[13px\]/);
    await expect(missionIndex).toHaveClass(/left-\[13px\]/);
    await expect(missionIndex).toHaveClass(/text-\[rgba\(255,255,255,\.75\)\]/);
    await expect(missionIndex).toHaveClass(/font-mono/);
    await expect(missionIndex).toHaveClass(/text-\[9px\]/);
    await expect(missionIndex).not.toHaveClass(/mission-index/);
    const giverGlyph = jobCard.locator("[data-giver-glyph]");
    await expect(giverGlyph).toHaveCount(1);
    await expect(giverGlyph).toHaveText("N");
    await expect(giverGlyph).toHaveClass(/w-\[22px\]/);
    await expect(giverGlyph).toHaveClass(/h-\[22px\]/);
    await expect(giverGlyph).toHaveClass(/grid/);
    await expect(giverGlyph).toHaveClass(/place-items-center/);
    await expect(giverGlyph).toHaveClass(/border-\[rgba\(98,232,255,\.32\)\]/);
    await expect(giverGlyph).toHaveClass(/text-\[var\(--cyan\)\]/);
    await expect(giverGlyph).toHaveClass(/font-mono/);
    await expect(giverGlyph).toHaveClass(/text-\[9px\]/);
    await expect(giverGlyph).not.toHaveClass(/giver-glyph/);
    const missionVote = jobCard.locator("[data-mission-vote]");
    await expect(missionVote).toHaveCount(1);
    await expect(missionVote).toHaveClass(/absolute/);
    await expect(missionVote).toHaveClass(/left-0/);
    await expect(missionVote).toHaveClass(/right-0/);
    await expect(missionVote).toHaveClass(/bottom-0/);
    await expect(missionVote).toHaveClass(/z-\[1\]/);
    await expect(missionVote).toHaveClass(/h-\[60px\]/);
    await expect(missionVote).toHaveClass(/flex/);
    await expect(missionVote).toHaveClass(/flex-row/);
    await expect(missionVote).toHaveClass(/items-center/);
    await expect(missionVote).toHaveClass(/justify-end/);
    await expect(missionVote).toHaveClass(/gap-2/);
    await expect(missionVote).toHaveClass(/pr-\[19px\]/);
    await expect(missionVote).toHaveClass(/bg-\[rgba\(8,11,17,\.65\)\]/);
    await expect(missionVote).toHaveClass(/border-t/);
    await expect(missionVote).toHaveClass(/border-\[var\(--line\)\]/);
    await expect(missionVote).toHaveClass(/max-\[760px\]:pr-\[10px\]/);
    await expect(missionVote).toHaveClass(/max-\[420px\]:pr-\[7px\]/);
    await expect(missionVote).not.toHaveClass(/mission-vote/);
    await expect(missionVote).toHaveCSS("position", "absolute");
    await expect(missionVote).toHaveCSS("height", "60px");
    await expect(missionVote).toHaveCSS("padding-right", "19px");

    const voteCount = jobCard.locator("[data-vote-count]");
    await expect(voteCount).toHaveClass(/mr-auto/);
    await expect(voteCount).toHaveClass(/text-\[var\(--dim\)\]/);
    await expect(voteCount).toHaveClass(/font-mono/);
    await expect(voteCount).toHaveClass(/text-\[8px\]/);
    await expect(voteCount).toHaveClass(/max-\[420px\]:text-\[7px\]/);
    await expect(voteCount).not.toHaveClass(/mission-vote/);
    const voteTotal = voteCount.locator("[data-vote-total]");
    await expect(voteTotal).toHaveClass(/mr-\[4px\]/);
    await expect(voteTotal).toHaveClass(/text-\[var\(--ink\)\]/);
    await expect(voteTotal).toHaveClass(/text-\[17px\]/);
    await expect(voteTotal).toHaveClass(/font-\[550\]/);
    await expect(voteTotal).toHaveClass(/max-\[760px\]:text-\[14px\]/);
    await expect(voteTotal).toHaveClass(/max-\[420px\]:text-\[12px\]/);
    await expect(voteTotal).toHaveClass(/max-\[420px\]:block/);
    await expect(voteTotal).not.toHaveClass(/mission-vote/);

    const voteButton = page.getByRole("button", {
      name: `Vote for ${jobTitle}`,
    });
    await expect(voteButton).toBeVisible();
    await expect(voteButton).toHaveClass(/min-w-\[75px\]/);
    await expect(voteButton).toHaveClass(/max-\[760px\]:min-w-\[63px\]/);
    await expect(voteButton).toHaveClass(/h-\[29px\]/);
    await expect(voteButton).toHaveClass(/inline-flex/);
    await expect(voteButton).toHaveClass(/items-center/);
    await expect(voteButton).toHaveClass(/justify-center/);
    await expect(voteButton).toHaveClass(/gap-\[6px\]/);
    await expect(voteButton).toHaveClass(/border-\[rgba\(98,232,255,\.34\)\]/);
    await expect(voteButton).toHaveClass(/bg-\[rgba\(98,232,255,\.05\)\]/);
    await expect(voteButton).toHaveClass(/text-\[var\(--cyan\)\]/);
    await expect(voteButton).toHaveClass(/font-mono/);
    await expect(voteButton).toHaveClass(/text-\[8px\]/);
    await expect(voteButton).toHaveClass(/tracking-\[\.1em\]/);
    await expect(voteButton).toHaveClass(/cursor-pointer/);
    await expect(voteButton).toHaveClass(
      /hover:bg-\[rgba\(98,232,255,\.13\)\]/,
    );
    await expect(voteButton).not.toHaveClass(/vote-button/);
    await expect(voteButton).not.toHaveClass(/vote-active/);
    await expect(voteButton).toHaveCSS("min-width", "75px");
    await expect(voteButton).toHaveCSS("height", "29px");
    await expect(voteButton).toHaveCSS("display", "flex");
    await expect(voteButton).toHaveCSS(
      "background-color",
      "rgba(98, 232, 255, 0.05)",
    );
    await voteButton.hover();
    await expect(voteButton).toHaveCSS(
      "background-color",
      "rgba(98, 232, 255, 0.13)",
    );

    const voteResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/jobs/${createdJobId}/vote`),
    );
    await voteButton.click();
    await voteResponsePromise;
    const votedButton = page.getByRole("button", {
      name: `Remove vote from ${jobTitle}`,
    });
    await expect(votedButton).toBeVisible();
    await expect(votedButton).toHaveClass(/bg-\[var\(--cyan\)\]/);
    await expect(votedButton).toHaveClass(/text-\[#071016\]/);
    await expect(votedButton).toHaveClass(/border-\[var\(--cyan\)\]/);
    await expect(votedButton).not.toHaveClass(/vote-button/);
    await expect(votedButton).not.toHaveClass(/vote-active/);
    await expect(votedButton).toHaveCSS(
      "background-color",
      "rgb(98, 232, 255)",
    );
    await expect(votedButton).toHaveCSS("color", "rgb(7, 16, 22)");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileGridColumns = await jobsGrid.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
    );
    expect(mobileGridColumns).toHaveLength(1);
    await expect(jobCard).toHaveCSS("min-height", "300px");
    await expect(missionContent).toHaveCSS("padding", "49px 20px 75px");
    await expect(missionTitle).toHaveCSS("font-size", "14px");
    await expect(missionSummary).toHaveCSS("font-size", "10px");
    await expect(missionVote).toHaveCSS("padding-right", "7px");
    await expect(voteCount).toHaveCSS("font-size", "7px");
    await expect(voteTotal).toHaveCSS("font-size", "12px");
    await expect(voteTotal).toHaveCSS("display", "block");
    await expect(votedButton).toHaveCSS("min-width", "63px");

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/campaigns/${campaign.campaignId}`);
    const compactCard = page
      .locator("article")
      .filter({ hasText: jobTitle })
      .first();
    await expect(compactCard).toBeVisible();
    await expect(compactCard).toHaveClass(/block/);
    await expect(compactCard).toHaveClass(/relative/);
    await expect(compactCard).toHaveClass(/overflow-hidden/);
    await expect(compactCard).toHaveClass(/border-b/);
    await expect(compactCard).toHaveClass(/border-\[var\(--line\)\]/);
    await expect(compactCard).toHaveClass(/bg-\[var\(--panel-deep\)\]/);
    await expect(compactCard).toHaveClass(/min-h-\[248px\]/);
    await expect(compactCard).not.toHaveClass(/mission-card/);
    await expect(compactCard).not.toHaveClass(/mission-compact/);
    await expect(compactCard).toHaveCSS("display", "block");
    await expect(compactCard).toHaveCSS("min-height", "248px");
    const compactContent = compactCard.locator("[data-mission-content]");
    await expect(compactContent).toHaveClass(/p-\[42px_20px_75px\]/);
    await expect(compactContent).toHaveCSS("padding", "42px 20px 75px");
    const compactFooter = compactCard.locator("[data-mission-footer]");
    await expect(compactFooter).toHaveClass(/mt-\[20px\]/);
    await expect(compactFooter).toHaveCSS("margin-top", "20px");
  } finally {
    if (createdJobId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/jobs/${createdJobId}`,
          page.url(),
        ).toString(),
      );
    }
    if (createdNpcId) {
      await page.request.delete(
        new URL(
          `/api/campaigns/${campaign.campaignId}/npcs/${createdNpcId}`,
          page.url(),
        ).toString(),
      );
    }
  }
});
