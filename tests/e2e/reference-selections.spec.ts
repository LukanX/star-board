import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { searchReferences } from "../../lib/references/catalog";

async function expectAlignedInputs(inputs: Locator[]) {
  const boxes = await Promise.all(inputs.map((input) => input.boundingBox()));
  const first = boxes[0];
  if (!first) throw new Error("Expected the first aligned input to be visible.");
  for (const box of boxes) {
    if (!box) throw new Error("Expected all aligned inputs to be visible.");
    expect(Math.abs(box.y - first.y)).toBeLessThanOrEqual(1);
    expect(box.height).toBe(42);
  }
}

for (const entity of ["npcs", "characters"] as const) {
  test(`keeps ${entity} inputs aligned when reference guidance wraps`, async ({ page, campaign }) => {
    await page.goto(`/campaigns/${campaign.campaignId}/${entity}`);
    await page.getByRole("button", { name: entity === "npcs" ? "ADD NPC" : "ADD CHARACTER", exact: true }).click();
    const form = page.locator("form.character-form");
    const species = form.getByRole("combobox", { name: "Species", exact: true });
    const name = form.getByLabel("Name", { exact: true });
    const peer = entity === "npcs"
      ? form.getByLabel("Role", { exact: true })
      : form.getByRole("combobox", { name: "Class", exact: true });

    for (const selected of [false, true]) {
      if (selected) {
        await species.fill("Kasatha");
        await page.getByRole("option", { name: /Kasatha/ }).click();
        await expect(species.locator("..")).toContainText("Kasatha selected");
      }
      for (const width of [1440, 900, 600, 390]) {
        await page.setViewportSize({ width, height: 900 });
        if (width > 760) {
          await expectAlignedInputs([name, species, peer, ...(entity === "characters" ? [form.getByLabel("Level", { exact: true })] : [])]);
        } else if (width > 420) {
          await expectAlignedInputs([species, peer]);
        }
        const inputBox = await species.boundingBox();
        const statusBox = await species.locator("..").locator("[aria-live]").boundingBox();
        if (!inputBox || !statusBox) throw new Error("Expected the reference input and guidance to be visible.");
        expect(statusBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height + 6);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
    }
  });
}

test("saves and reloads official ancestry/class selections while keeping custom text", async ({ page, campaign }) => {
  test.setTimeout(60000);
  const name = `Reference Character ${Date.now()}`;
  const created = await page.request.post(`/api/campaigns/${campaign.campaignId}/characters`, { data: { name, species: "Custom", className: "Custom" } });
  expect(created.ok()).toBeTruthy();
  const id = (await created.json()).character.id as string;
  const endpoint = `/api/campaigns/${campaign.campaignId}/characters/${id}`;
  try {
    await page.goto(`/campaigns/${campaign.campaignId}/characters/${id}`);
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    const species = page.getByRole("combobox", { name: "Species", exact: true });
    const className = page.getByRole("combobox", { name: "Class", exact: true });
    await species.fill("Kasatha");
    await expect(page.getByRole("option", { name: /Kasatha/ })).toBeVisible();
    await species.press("ArrowDown");
    await species.press("Enter");
    await className.fill("Witchwarper");
    await page.getByRole("option", { name: /Witchwarper/ }).click();
    const save = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "SAVE CHARACTER", exact: true }).click();
    const saved = await save;
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).character).toMatchObject({
      species: "Kasatha",
      class_name: "Witchwarper",
      ancestry_reference_id: searchReferences("ancestry", "Kasatha")[0].binding.id,
      class_reference_id: searchReferences("class", "Witchwarper")[0].binding.id,
    });
    await page.reload();
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    await expect(page.getByText("Kasatha selected", { exact: false })).toBeVisible();
    await expect(species).toHaveValue("Kasatha");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await species.locator("..").getByRole("button", { name: "Use custom text" }).click();
    await expect(species).toHaveValue("Kasatha");
    await species.fill("Homebrew four-armed traveler");
    const customSave = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "SAVE CHARACTER", exact: true }).click();
    const custom = await customSave;
    expect(custom.ok()).toBeTruthy();
    expect((await custom.json()).character).toMatchObject({ species: "Homebrew four-armed traveler", ancestry_reference_id: null, ancestry_catalog_version: null });
  } finally {
    await page.request.delete(endpoint);
  }
});

test("handles lookup failures, retry, and obsolete responses without blocking custom text", async ({ page, campaign }) => {
  test.setTimeout(60000);
  let fail = true;
  let slowStarted = false;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/references?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (fail) {
      await route.fulfill({ status: 503, json: { error: "Reference lookup unavailable for testing." } });
    } else if (query.get("q") === "Vesk") {
      const response = await route.fetch();
      slowStarted = true;
      await gate;
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto(`/campaigns/${campaign.campaignId}/npcs`);
    await page.getByRole("button", { name: "ADD NPC", exact: true }).click();
    const species = page.getByRole("combobox", { name: "Species", exact: true });
    await expect(page.getByRole("alert").filter({ hasText: "Reference lookup unavailable for testing." })).toBeVisible();
    await expectAlignedInputs([
      page.locator("form.character-form").getByLabel("Name", { exact: true }),
      species,
      page.locator("form.character-form").getByLabel("Role", { exact: true }),
    ]);
    fail = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await species.focus();
    await expect(page.getByRole("option").first()).toBeVisible();
    await species.fill("Vesk");
    await expect.poll(() => slowStarted).toBe(true);
    await species.fill("Kasatha");
    await expect(page.getByRole("option", { name: /Kasatha/ })).toBeVisible();
    release();
    await expect(page.getByRole("option", { name: /Vesk/ })).toHaveCount(0);
    await species.press("Escape");
    await expect(species).toHaveAttribute("aria-expanded", "false");
    await species.fill("My custom species");
    await expect(page.getByText("No matches. Keep your custom text.")).toBeVisible();
  } finally {
    release();
  }
});

test("keeps NPC workspace bindings aligned during revisions and applies only on request", async ({ page, campaign }) => {
  test.setTimeout(60000);
  const requests: Array<{ species?: string; ancestryReference?: { id: string }; mode: string }> = [];
  await page.route("**/api/ai/models**", (route) => route.fulfill({ status: 200, json: { status: "live", models: [] } }));
  await page.route("**/api/ai/npc", async (route) => {
    const body = route.request().postDataJSON() as (typeof requests)[number];
    requests.push(body);
    await route.fulfill({ status: 200, json: { model: "local/mock-model", draft: {
      name: "Reference Pilot", species: body.species, role: "Pilot", shortDescription: "A careful traveler.",
      playerNotes: "", gmNotes: "", motivation: "", visualPrompt: "A pilot beside a shuttle.",
    } } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/npcs`);
  await page.getByRole("button", { name: "ADD NPC", exact: true }).click();
  await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
  const workspace = page.locator("[data-ai-draft-assistant]");
  const species = workspace.getByRole("combobox", { name: "Species", exact: true });
  await expectAlignedInputs([
    workspace.getByLabel("Name", { exact: true }),
    species,
    workspace.getByLabel("Role", { exact: true }),
  ]);
  await species.fill("Vesk");
  await workspace.getByRole("option", { name: /Vesk/ }).click();
  await page.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
  await expect(page.getByRole("button", { name: "USE DRAFT", exact: true })).toBeVisible();
  expect(requests[0].ancestryReference?.id).toBe(searchReferences("ancestry", "Vesk")[0].binding.id);
  await species.fill("Kasatha");
  await workspace.getByRole("option", { name: /Kasatha/ }).click();
  await expect(page.getByRole("button", { name: "USE DRAFT", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "REVISE DRAFT", exact: true }).click();
  await expect(page.getByRole("button", { name: "USE DRAFT", exact: true })).toBeEnabled();
  expect(requests[1]).toMatchObject({ species: "Kasatha", mode: "refine", ancestryReference: { id: searchReferences("ancestry", "Kasatha")[0].binding.id } });
  await page.getByRole("button", { name: "USE DRAFT", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Species", exact: true })).toHaveValue("Kasatha");
  await expect(page.getByRole("combobox", { name: "Species", exact: true }).locator("..").getByText("Kasatha selected", { exact: false })).toBeVisible();
});
