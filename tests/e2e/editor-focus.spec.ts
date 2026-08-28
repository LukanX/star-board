import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type EditorFixture = {
  characterId: string;
  characterName: string;
  enemyId: string;
  enemyName: string;
  factionId: string;
  factionName: string;
  jobId: string;
  jobTitle: string;
  episodeJobId: string;
  episodeJobTitle: string;
  episodeId: string;
  noteId: string;
  noteTitle: string;
  npcId: string;
  npcName: string;
  placeId: string;
  placeName: string;
};

type ApiEntityPayload = Record<string, { id?: string } | undefined>;

async function createEditorFixture(
  page: Page,
  campaignId: string,
): Promise<EditorFixture> {
  const timestamp = Date.now();
  const names = {
    characterName: `Editor Focus Character ${timestamp}`,
    enemyName: `Editor Focus Enemy ${timestamp}`,
    factionName: `Editor Focus Faction ${timestamp}`,
    jobTitle: `Editor Focus Mission ${timestamp}`,
    noteTitle: `Editor Focus Note ${timestamp}`,
    npcName: `Editor Focus NPC ${timestamp}`,
    placeName: `Editor Focus Place ${timestamp}`,
    episodeJobTitle: `Editor Focus Episode Source ${timestamp}`,
  };

  const post = async (path: string, data: Record<string, unknown>) => {
    const response = await page.request.post(
      new URL(path, page.url()).toString(),
      { data },
    );
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as ApiEntityPayload;
  };

  const placePayload = await post(`/api/campaigns/${campaignId}/places`, {
    name: names.placeName,
    kind: "station",
    description: `A place for editor focus coverage ${timestamp}.`,
    playerNotesMarkdown: `Public place notes ${timestamp}.`,
    gmNotesMarkdown: `Private place notes ${timestamp}.`,
    parentPlaceId: null,
    artSubject: "",
    artPath: null,
    artPrompt: null,
    artProvider: null,
  });
  const placeId = placePayload.place?.id;
  expect(placeId).toBeTruthy();

  const npcPayload = await post(`/api/campaigns/${campaignId}/npcs`, {
    name: names.npcName,
    species: "Android",
    role: "Signal keeper",
    description: `A contact for editor focus coverage ${timestamp}.`,
    playerNotesMarkdown: `Public NPC notes ${timestamp}.`,
    gmNotesMarkdown: `Private NPC notes ${timestamp}.`,
    artSubject: "",
    artPath: null,
    artPrompt: null,
    artProvider: null,
    placeId,
  });
  const npcId = npcPayload.npc?.id;
  expect(npcId).toBeTruthy();

  const factionPayload = await post(`/api/campaigns/${campaignId}/factions`, {
    name: names.factionName,
    description: `A faction for editor focus coverage ${timestamp}.`,
    status: "active",
    artSubject: "",
    artPath: null,
    artPrompt: null,
    artProvider: null,
    placeId,
  });
  const factionId = factionPayload.faction?.id;
  expect(factionId).toBeTruthy();

  const characterPayload = await post(
    `/api/campaigns/${campaignId}/characters`,
    {
      name: names.characterName,
      species: "Android",
      className: "Navigator",
      level: 3,
      backstoryMarkdown: `Character history ${timestamp}.`,
      physicalDescription: `Character appearance ${timestamp}.`,
    },
  );
  const characterId = characterPayload.character?.id;
  expect(characterId).toBeTruthy();

  const enemyPayload = await post(`/api/campaigns/${campaignId}/enemies`, {
    name: names.enemyName,
    playerDescription: `A threat for editor focus coverage ${timestamp}.`,
    isRevealed: true,
    level: 2,
    size: "medium",
    rarity: "common",
    traits: ["beast"],
    family: "editor focus",
    statBlock: { schemaVersion: 1 },
    gmNotesMarkdown: `Private enemy notes ${timestamp}.`,
    origin: "manual",
    artSubject: null,
    artPath: null,
    artPrompt: null,
    artProvider: null,
    sourceSnapshot: null,
  });
  const enemyId = enemyPayload.enemy?.id;
  expect(enemyId).toBeTruthy();

  const jobPayload = await post(`/api/campaigns/${campaignId}/jobs`, {
    title: names.jobTitle,
    summary: `A mission for editor focus coverage ${timestamp}.`,
    playerNotesMarkdown: `Public mission notes ${timestamp}.`,
    gmNotesMarkdown: `Private mission notes ${timestamp}.`,
    hook: `Mission hook ${timestamp}.`,
    giverType: "npc",
    giverId: npcId,
    placeId,
    status: "open",
    artSubject: "",
    artPath: null,
    artPrompt: null,
    artProvider: null,
  });
  const jobId = jobPayload.job?.id;
  expect(jobId).toBeTruthy();

  const episodeJobPayload = await post(`/api/campaigns/${campaignId}/jobs`, {
    title: names.episodeJobTitle,
    summary: `An episode source for editor focus coverage ${timestamp}.`,
    playerNotesMarkdown: `Public episode source notes ${timestamp}.`,
    gmNotesMarkdown: `Private episode source notes ${timestamp}.`,
    hook: `Episode source hook ${timestamp}.`,
    giverType: "npc",
    giverId: npcId,
    placeId,
    status: "open",
    artSubject: "",
    artPath: null,
    artPrompt: null,
    artProvider: null,
  });
  const episodeJobId = episodeJobPayload.job?.id;
  expect(episodeJobId).toBeTruthy();

  const episodeResponse = await page.request.post(
    new URL(`/api/campaigns/${campaignId}/jobs/${episodeJobId}/promote`, page.url()).toString(),
  );
  expect(episodeResponse.ok()).toBeTruthy();
  const episodePayload = (await episodeResponse.json()) as ApiEntityPayload;
  const episodeId = episodePayload.episode?.id;
  expect(episodeId).toBeTruthy();

  const notePayload = await post(`/api/campaigns/${campaignId}/notes`, {
    title: names.noteTitle,
    bodyMarkdown: `Note body for editor focus coverage ${timestamp}.`,
    visibility: "player",
    episodeId: null,
  });
  const noteId = notePayload.note?.id;
  expect(noteId).toBeTruthy();

  return {
    ...names,
    characterId: characterId!,
    enemyId: enemyId!,
    factionId: factionId!,
    jobId: jobId!,
    episodeJobId: episodeJobId!,
    episodeId: episodeId!,
    noteId: noteId!,
    npcId: npcId!,
    placeId: placeId!,
  };
}

async function deleteEditorFixture(
  page: Page,
  campaignId: string,
  fixture: EditorFixture,
) {
  const deletions = [
    [`/api/campaigns/${campaignId}/episodes/${fixture.episodeId}`, "delete"],
    [`/api/campaigns/${campaignId}/jobs?jobId=${fixture.episodeJobId}`, "delete"],
    [`/api/campaigns/${campaignId}/jobs?jobId=${fixture.jobId}`, "delete"],
    [`/api/campaigns/${campaignId}/notes/${fixture.noteId}`, "delete"],
    [`/api/campaigns/${campaignId}/factions/${fixture.factionId}`, "delete"],
    [`/api/campaigns/${campaignId}/npcs/${fixture.npcId}`, "delete"],
    [`/api/campaigns/${campaignId}/enemies/${fixture.enemyId}`, "delete"],
    [`/api/campaigns/${campaignId}/characters/${fixture.characterId}`, "delete"],
    [`/api/campaigns/${campaignId}/places/${fixture.placeId}`, "delete"],
  ] as const;

  for (const [path] of deletions) {
    await page.request.delete(new URL(path, page.url()).toString());
  }
}

type ListEditorCase = {
  section: string;
  launcher: string;
  collection: string;
  name: string;
  saveLabel: string;
  saveIcon: boolean;
};

async function exerciseListEditor(
  page: Page,
  campaignId: string,
  editorCase: ListEditorCase,
) {
  await page.goto(`/campaigns/${campaignId}/${editorCase.section}`);
  await expect(
    page.getByText(editorCase.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(editorCase.collection)).toBeVisible();
  await expect(
    page.getByRole("button", { name: editorCase.launcher, exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: editorCase.launcher, exact: true })
    .click();

  await expect(page.locator(editorCase.collection)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: editorCase.launcher, exact: true }),
  ).toHaveCount(0);
  const form = page.locator("form.character-form").first();
  const saveButton = form.locator("button[type=submit]");
  await expect(saveButton).toHaveText(editorCase.saveLabel);
  if (editorCase.saveIcon) {
    await expect(saveButton.locator("svg.lucide-save")).toHaveCount(1);
  }

  await form.getByRole("button", { name: "CANCEL", exact: true }).click();
  await expect(page.locator(editorCase.collection)).toBeVisible();
  await expect(
    page.getByRole("button", { name: editorCase.launcher, exact: true }),
  ).toBeVisible();
}

test("focuses every list editor and restores the saved collection on cancel", async ({
  page,
  campaign,
}) => {
  test.setTimeout(60000);
  let fixture: EditorFixture | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}`);
    fixture = await createEditorFixture(page, campaign.campaignId);

    const listCases: ListEditorCase[] = [
      {
        section: "characters",
        launcher: "ADD CHARACTER",
        collection: "[data-character-grid]",
        name: fixture.characterName,
        saveLabel: "SAVE CHARACTER",
        saveIcon: false,
      },
      {
        section: "enemies",
        launcher: "ADD ENEMY",
        collection: "[data-enemies-layout]",
        name: fixture.enemyName,
        saveLabel: "SAVE ENEMY",
        saveIcon: false,
      },
      {
        section: "factions",
        launcher: "ADD FACTION",
        collection: "[data-factions-toolbar]",
        name: fixture.factionName,
        saveLabel: "SAVE FACTION",
        saveIcon: false,
      },
      {
        section: "jobs",
        launcher: "NEW MISSION",
        collection: "[data-jobs-toolbar]",
        name: fixture.jobTitle,
        saveLabel: "SAVE MISSION",
        saveIcon: true,
      },
      {
        section: "notes",
        launcher: "ADD NOTE",
        collection: "[data-notes-list]",
        name: fixture.noteTitle,
        saveLabel: "SAVE NOTE",
        saveIcon: true,
      },
      {
        section: "npcs",
        launcher: "ADD NPC",
        collection: "[data-npcs-toolbar]",
        name: fixture.npcName,
        saveLabel: "SAVE NPC",
        saveIcon: false,
      },
      {
        section: "places",
        launcher: "ADD ROOT PLACE",
        collection: "[data-places-toolbar]",
        name: fixture.placeName,
        saveLabel: "SAVE PLACE",
        saveIcon: true,
      },
    ];

    for (const editorCase of listCases) {
      await exerciseListEditor(page, campaign.campaignId, editorCase);
    }
  } finally {
    if (fixture) {
      await deleteEditorFixture(page, campaign.campaignId, fixture);
    }
  }
});

type DetailEditorCase = {
  section: string;
  id: string;
  name: string;
  record: string;
  editButton: string;
  field: string;
  saveLabel: string;
  saveIcon: boolean;
};

async function exerciseDetailEditor(
  page: Page,
  campaignId: string,
  editorCase: DetailEditorCase,
) {
  await page.goto(
    `/campaigns/${campaignId}/${editorCase.section}/${editorCase.id}`,
  );
  const record = page.locator(editorCase.record);
  await expect(record).toBeVisible();
  const editButton = page.getByRole("button", {
    name: `Edit ${editorCase.name}`,
    exact: true,
  });
  await editButton.click();

  await expect(record).toHaveCount(0);
  await expect(editButton).toHaveCount(0);
  const form = page.locator("form.character-form").first();
  await expect(
    form.getByRole("textbox", { name: editorCase.field, exact: true }),
  ).toHaveValue(editorCase.name);
  const saveButton = form.locator("button[type=submit]");
  await expect(saveButton).toHaveText(editorCase.saveLabel);
  if (editorCase.saveIcon) {
    await expect(saveButton.locator("svg.lucide-save")).toHaveCount(1);
  }

  await form.getByRole("button", { name: "CANCEL", exact: true }).click();
  await expect(record).toBeVisible();
}

test("replaces every saved detail record with its pre-populated editor", async ({
  page,
  campaign,
}) => {
  test.setTimeout(60000);
  let fixture: EditorFixture | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}`);
    fixture = await createEditorFixture(page, campaign.campaignId);

    const detailCases: DetailEditorCase[] = [
      {
        section: "characters",
        id: fixture.characterId,
        name: fixture.characterName,
        record: '[aria-labelledby="character-public-record-title"]',
        editButton: "EDIT",
        field: "Name",
        saveLabel: "SAVE CHARACTER",
        saveIcon: false,
      },
      {
        section: "enemies",
        id: fixture.enemyId,
        name: fixture.enemyName,
        record: "[data-archive-record]",
        editButton: "EDIT",
        field: "Name",
        saveLabel: "SAVE ENEMY",
        saveIcon: false,
      },
      {
        section: "factions",
        id: fixture.factionId,
        name: fixture.factionName,
        record: "[data-archive-record]",
        editButton: "EDIT",
        field: "Name",
        saveLabel: "SAVE FACTION",
        saveIcon: false,
      },
      {
        section: "jobs",
        id: fixture.jobId,
        name: fixture.jobTitle,
        record: '[aria-labelledby="job-public-record-title"]',
        editButton: "EDIT",
        field: "Title",
        saveLabel: "SAVE MISSION",
        saveIcon: true,
      },
      {
        section: "episodes",
        id: fixture.episodeId,
        name: fixture.episodeJobTitle,
        record: '[aria-labelledby="episode-public-record-title"]',
        editButton: "EDIT",
        field: "Title",
        saveLabel: "SAVE EPISODE",
        saveIcon: true,
      },
      {
        section: "notes",
        id: fixture.noteId,
        name: fixture.noteTitle,
        record: '[aria-labelledby="note-public-record-title"]',
        editButton: "EDIT",
        field: "Title",
        saveLabel: "SAVE NOTE",
        saveIcon: true,
      },
      {
        section: "npcs",
        id: fixture.npcId,
        name: fixture.npcName,
        record: "[data-archive-record]",
        editButton: "EDIT",
        field: "Name",
        saveLabel: "SAVE NPC",
        saveIcon: false,
      },
      {
        section: "places",
        id: fixture.placeId,
        name: fixture.placeName,
        record: "[data-archive-record]",
        editButton: "EDIT",
        field: "Name",
        saveLabel: "SAVE PLACE",
        saveIcon: true,
      },
    ];

    for (const editorCase of detailCases) {
      await exerciseDetailEditor(page, campaign.campaignId, editorCase);
    }

    await page.goto(`/campaigns/${campaign.campaignId}/jobs`);
    await page
      .getByRole("button", { name: `Edit ${fixture.jobTitle}`, exact: true })
      .click();
    await expect(page.locator("[data-jobs-grid]")).toHaveCount(0);
    await expect(page.getByLabel("Title")).toHaveValue(fixture.jobTitle);
    await expect(
      page.locator("form.character-form button[type=submit]").first(),
    ).toHaveText("SAVE MISSION");
    await page
      .locator("form.character-form")
      .first()
      .getByRole("button", { name: "CANCEL", exact: true })
      .click();
    await expect(page.locator("[data-jobs-grid]")).toBeVisible();
  } finally {
    if (fixture) {
      await deleteEditorFixture(page, campaign.campaignId, fixture);
    }
  }
});

test("focuses child-place creation and preselects the hidden parent", async ({
  page,
  campaign,
}) => {
  let fixture: EditorFixture | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}`);
    fixture = await createEditorFixture(page, campaign.campaignId);
    await page.goto(
      `/campaigns/${campaign.campaignId}/places/${fixture.placeId}`,
    );

    await page
      .getByRole("button", {
        name: `Add child under ${fixture.placeName}`,
        exact: true,
      })
      .click();

    await expect(page.locator("[data-archive-record]")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Add child under ${fixture.placeName}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Parent")).toHaveValue(fixture.placeId);
    const saveButton = page.locator("form.character-form button[type=submit]").first();
    await expect(saveButton).toHaveText("SAVE PLACE");
    await expect(saveButton.locator("svg.lucide-save")).toHaveCount(1);

    await page
      .locator("form.character-form")
      .first()
      .getByRole("button", { name: "CANCEL", exact: true })
      .click();
    await expect(page.locator("[data-archive-record]")).toBeVisible();
  } finally {
    if (fixture) {
      await deleteEditorFixture(page, campaign.campaignId, fixture);
    }
  }
});
