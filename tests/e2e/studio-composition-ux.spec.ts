import { expect, test } from "./fixtures";
import type { StudioComposition } from "../../lib/validation/studio";
import type { Locator } from "@playwright/test";

const actorId = "00000000-0000-4000-8000-000000000061";
const placeId = "00000000-0000-4000-8000-000000000062";
const npcId = "00000000-0000-4000-8000-000000000063";
const actor = { kind: "character", id: actorId, name: "Astra Vale", art_path: "private-art", updated_at: "now", hasReferenceImage: true, thumbnailUrl: null };
const place = { kind: "place", id: placeId, name: "Astral Hangar", art_path: null, updated_at: "now", hasReferenceImage: false, thumbnailUrl: null };
const npc = { kind: "npc", id: npcId, name: "Astra Vale", art_path: null, updated_at: "now", hasReferenceImage: false, thumbnailUrl: null };
const subjects = [actor, place, npc];

async function expectSuggestionsAtCaret(direction: Locator, options: Locator, line: number, prefix: string) {
  await expect.poll(async () => {
    if (!await options.count()) return { horizontal: false, vertical: false, bounds: false };
    const caret = await direction.evaluate((element, { line, prefix }) => {
      const style = getComputedStyle(element);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Caret regression requires a canvas text measurement.");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const rect = element.getBoundingClientRect();
      const top = rect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + line * parseFloat(style.lineHeight) - element.scrollTop;
      return {
        left: rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + context.measureText(prefix).width - element.scrollLeft,
        top, bottom: top + parseFloat(style.lineHeight), viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      };
    }, { line, prefix });
    const box = await options.locator("..").boundingBox();
    if (!box) return { horizontal: false, vertical: false, bounds: false };
    const expectedLeft = Math.max(8, Math.min(caret.left, caret.viewportWidth - box.width - 8));
    const belowGap = box.y - caret.bottom;
    const aboveGap = caret.top - (box.y + box.height);
    return {
      horizontal: Math.abs(box.x - expectedLeft) <= 2,
      vertical: Math.max(belowGap, aboveGap) >= 1 && Math.min(Math.abs(belowGap), Math.abs(aboveGap)) <= 12,
      bounds: box.x >= 8 && box.y >= 8 && box.x + box.width <= caret.viewportWidth - 8 && box.y + box.height <= caret.viewportHeight - 8,
    };
  }).toEqual({ horizontal: true, vertical: true, bounds: true });
}

test.beforeEach(async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) => {
    const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
    return route.fulfill({ json: { status: "live", defaultModel: `test/${capability}`, models: [{
      id: `test/${capability}`, label: "Local test model", capability, enabled: true, available: true, compatible: true,
      inputModalities: ["text", "image"], supportedParameters: ["aspect_ratio", "input_references"], parameterValues: { aspect_ratio: ["1:1", "16:9"] },
      description: "", providerName: "test", pricing: null,
    }] } });
  });
  await page.route(`**/api/campaigns/${campaign.campaignId}/visual-styles`, (route) => route.fulfill({ json: { styles: [] } }));
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/subjects?*`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { subjects: subjects.filter((subject) => subject.kind === query.get("kind") && (!query.get("id") || subject.id === query.get("id"))) } });
  });
  await page.route(`**/api/campaigns/${campaign.campaignId}/entities/search?*`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const sections = query.get("sections")?.split(",") ?? [];
    expect(query.get("audience")).toBe("gm");
    const options = [
      { id: actorId, type: "characters", label: actor.name, meta: "Human // Soldier" },
      { id: npcId, type: "npcs", label: npc.name, meta: "Android // Guide" },
      { id: placeId, type: "places", label: place.name, meta: "hangar" },
    ];
    return route.fulfill({ json: { entities: options.filter((option) => sections.includes(option.type)).map((option) => ({ ...option, href: `/campaigns/${campaign.campaignId}/${option.type}/${option.id}` })) } });
  });
  await page.route(`**/api/campaigns/${campaign.campaignId}/entities/preview?*`, (route) => {
    const subject = subjects.find((value) => value.id === new URL(route.request().url()).searchParams.get("id"));
    return route.fulfill({ json: { entity: { id: subject!.id, name: subject!.name, imageUrl: null } } });
  });
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/preview`, (route) => {
    const body = route.request().postDataJSON() as { subject: string; studio: StudioComposition };
    return route.fulfill({ json: {
      prompt: `Direction: ${body.subject}`, length: 200, limit: 3000, overBy: 0, directionMissing: !body.subject.trim(), sections: [],
      defaults: { style: "", subjects: body.studio.subjects.map((subject) => ({ ...subject, name: subjects.find((item) => item.id === subject.id)!.name, description: "Saved appearance", appearance: "" })) },
    } });
  });
  await page.route("**/api/ai/image", (route) => route.fulfill({ status: 503, json: { error: "No paid generation in UX tests." } }));
  await page.route("**/api/ai/art-prompt", (route) => route.fulfill({ status: 503, json: { error: "No paid assistance in UX tests." } }));
});

for (const width of [1280, 390]) {
  test.describe(`caret suggestions at ${width}px`, () => {
    test.use({ hasTouch: true });
  test(`anchors @ suggestions to the caret through wrapping, scrolling and resize at ${width}px`, async ({ page, campaign }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
    await page.evaluate(async () => { await document.fonts.ready; });
    const direction = page.getByLabel("Direction", { exact: true });
    const options = page.getByRole("listbox", { name: "Visual subject suggestions" });
    await direction.fill("Meet @As");
    await expect(options.getByRole("option")).toHaveCount(3);
    await expectSuggestionsAtCaret(direction, options, 0, "Meet @As");

    await direction.fill("First scene.\nSecond scene.\nMeet @As\nA final scene.");
    await direction.press("Home");
    await direction.press("ArrowUp");
    await direction.press("End");
    await expect(options.getByRole("option")).toHaveCount(3);
    await expectSuggestionsAtCaret(direction, options, 2, "Meet @As");

    const columns = await direction.evaluate((element) => {
      element.style.fontFamily = "monospace";
      element.style.fontSize = "16px";
      element.style.lineHeight = "24px";
      const style = getComputedStyle(element);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Wrapped caret regression requires canvas.");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return Math.floor((element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / context.measureText("x").width);
    });
    await direction.fill(`${"x".repeat(columns * 7 + 5)} @As`);
    await expect(options.getByRole("option")).toHaveCount(3);
    await expect.poll(() => direction.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectSuggestionsAtCaret(direction, options, 7, "xxxxx @As");
    await direction.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
    await expect(options).toHaveCount(0);
    await direction.evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
    await expectSuggestionsAtCaret(direction, options, 7, "xxxxx @As");

    await direction.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error("Horizontal caret regression requires the Direction textarea.");
      element.wrap = "off"; element.style.whiteSpace = "pre"; element.style.overflowWrap = "normal";
      element.scrollLeft = element.scrollWidth; element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => direction.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expectSuggestionsAtCaret(direction, options, 0, `${"x".repeat(columns * 7 + 5)} @As`);
    await direction.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error("Caret regression must restore the Direction textarea.");
      element.wrap = "soft"; element.style.whiteSpace = ""; element.style.overflowWrap = "";
    });
    await direction.fill("Meet @As");
    await expect(options.getByRole("option")).toHaveCount(3);
    await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 900 });
    await expectSuggestionsAtCaret(direction, options, 0, "Meet @As");
    await page.evaluate(() => window.scrollBy(0, 40));
    await expectSuggestionsAtCaret(direction, options, 0, "Meet @As");

    await direction.evaluate((element) => {
      element.style.marginTop = "1200px";
      window.scrollBy(0, element.getBoundingClientRect().top - (window.innerHeight - 60));
    });
    await expectSuggestionsAtCaret(direction, options, 0, "Meet @As");
    const box = await options.locator("..").boundingBox();
    expect(box!.y + box!.height).toBeLessThan((await direction.boundingBox())!.y + 12);
    await options.getByRole("option", { name: /@Astral Hangar/ }).tap();
    await expect(direction).toHaveValue("Meet @Astral Hangar");
    await expect(options).toHaveCount(0);
  });
  });

  test(`selects @ visual subjects and groups image/text defaults at ${width}px`, async ({ page, campaign }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
    const composer = page.getByRole("region", { name: "AI Studio composer" });
    const direction = composer.getByLabel("Direction", { exact: true });
    await direction.fill("The crew follows @As");
    const options = page.getByRole("listbox", { name: "Visual subject suggestions" });
    await expect(options.getByRole("option")).toHaveCount(3);
    const popup = await options.locator("..").boundingBox();
    expect(popup!.x).toBeGreaterThanOrEqual(0);
    expect(popup!.y).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(width);
    expect(popup!.y + popup!.height).toBeLessThanOrEqual(900);
    await direction.press("Enter");
    await expect(direction).toHaveValue("The crew follows @Astra Vale");
    const actors = composer.getByRole("region", { name: "Actors", exact: true });
    await expect(actors).toContainText("IMAGE REFERENCE");
    await actors.getByRole("button", { name: "Subject options", exact: true }).click();
    await expect(actors.getByLabel("Use existing image")).toBeChecked();
    await expect(actors.getByLabel("Include description")).not.toBeChecked();
    await direction.fill("Meet @As");
    await expect(options.getByRole("option")).toHaveCount(3);
    await direction.press("ArrowDown");
    await direction.press("Enter");
    await expect(actors.getByRole("listitem")).toHaveCount(2);
    await expect(actors).toContainText("NPC / TEXT");

    await direction.fill("Meet at @As");
    await expect(options.getByRole("option")).toHaveCount(3);
    await options.getByRole("option", { name: /@Astral Hangar/ }).click();
    await expect(composer.getByRole("region", { name: "Place", exact: true })).toContainText("Astral Hangar");
    await direction.fill("The crew guards the hangar.");
    await expect(actors.getByRole("listitem")).toHaveCount(2);
    const generate = composer.getByRole("button", { name: "Generate image draft", exact: true });
    await expect(generate).toBeEnabled();
    const settings = composer.locator('[aria-label="Image generation settings"]');
    expect((await settings.boundingBox())!.y).toBeGreaterThan((await direction.boundingBox())!.y);
    expect((await settings.boundingBox())!.y).toBeLessThan((await generate.boundingBox())!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("reviews and iterates direction rewrites, rejects stale candidates, and checkpoints assistance", async ({ page, campaign }) => {
  const requests: { direction: string; feedback?: string }[] = [];
  await page.route("**/api/ai/art-prompt", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { draft: { prompt: requests.length === 1 ? "The crew defends the hangar." : "The crew defends a storm-lit hangar." }, allowance: 600 } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const direction = composer.getByLabel("Direction", { exact: true });
  await expect(composer.getByLabel("Direction refinement feedback")).toHaveCount(0);
  await direction.fill("Defend hangar");
  await composer.getByRole("button", { name: "Rewrite direction with AI", exact: true }).click();
  await expect(direction).toHaveValue("Defend hangar");
  await composer.getByLabel("Direction refinement feedback").fill("Add a storm");
  await composer.getByRole("button", { name: "Refine direction", exact: true }).click();
  expect(requests[1]).toMatchObject({ direction: "The crew defends the hangar.", feedback: "Add a storm" });
  await expect(direction).toHaveValue("Defend hangar");
  await composer.getByRole("button", { name: "Apply direction", exact: true }).click();
  await expect(direction).toHaveValue("The crew defends a storm-lit hangar.");
  await composer.getByRole("button", { name: "Rewrite direction with AI", exact: true }).click();
  await expect(composer.getByRole("button", { name: "Apply direction", exact: true })).toBeEnabled();
  await direction.fill("Manually changed Direction");
  await expect(composer.getByRole("button", { name: "Apply direction", exact: true })).toBeDisabled();
  await expect(composer.getByRole("button", { name: "Rewrite direction with AI", exact: true })).toBeDisabled();
  await composer.getByRole("button", { name: "Discard rewrite", exact: true }).click();
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await page.reload();
  await expect(composer.getByLabel("Direction refinement feedback")).toHaveCount(0);
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(direction).toHaveValue("Manually changed Direction");
  await expect(composer.getByLabel("Direction refinement feedback")).toHaveValue("");
});

test("explains disabled Generate on focus, hover, and mobile and recovers from preview failures", async ({ page, campaign }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const generate = composer.getByRole("button", { name: "Generate image draft", exact: true });
  const action = composer.getByRole("group", { name: "Image generation action" });
  await expect(generate).toBeDisabled();
  await expect(composer.locator("p").filter({ hasText: /^Write a direction to generate\.$/ })).toBeVisible();
  await action.focus();
  await expect(composer.getByRole("tooltip")).toBeVisible();
  await expect(composer.getByRole("tooltip")).toHaveText("Write a direction to generate.");
  await action.press("Escape");
  await expect(composer.getByRole("tooltip")).not.toBeVisible();
  await action.hover();
  await expect(composer.getByRole("tooltip")).toBeVisible();
  const box = await composer.getByRole("tooltip").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/preview`, (route) => route.fulfill({ status: 503, json: { error: "Preview data is temporarily unavailable." } }));
  await composer.getByLabel("Direction", { exact: true }).fill("Crew in the hangar");
  await expect(composer.getByRole("alert")).toContainText("Preview data is temporarily unavailable.");
  await expect(generate).toBeDisabled();
  await action.focus();
  await expect(composer.getByRole("tooltip")).toHaveText("Preview data is temporarily unavailable.");
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/preview`, (route) => route.fulfill({ json: {
    prompt: "Crew in the hangar", length: 100, limit: 3000, overBy: 0, directionMissing: false, sections: [], defaults: { style: "", subjects: [] },
  } }));
  await composer.getByRole("button", { name: "Refresh preview", exact: true }).click();
  await expect(generate).toBeEnabled();
  await expect(composer.getByRole("tooltip")).toHaveCount(0);
});

test("limits map @ suggestions to Places and keeps failed assistance from revealing feedback", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByRole("button", { name: "Battlemap", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("A map of @As");
  const options = page.getByRole("listbox", { name: "Visual subject suggestions" });
  await expect(options.getByRole("option")).toHaveCount(1);
  await options.getByRole("option").click();
  await composer.getByRole("button", { name: "Rewrite direction with AI", exact: true }).click();
  await expect(composer.getByRole("alert")).toContainText("No paid assistance");
  await expect(composer.getByLabel("Direction refinement feedback")).toHaveCount(0);
  await expect(composer.getByRole("region", { name: "Actors", exact: true })).toHaveCount(0);
});

test("blocks unreadable artwork before image submission and switches to text explicitly", async ({ page, campaign }) => {
  let submitted = 0;
  await page.route("**/api/ai/image", (route) => { submitted++; return route.fulfill({ status: 503, json: { error: "No paid generation." } }); });
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/preview`, (route) => {
    const body = route.request().postDataJSON() as { subject: string; studio: StudioComposition; verifyReferences?: boolean };
    if (body.verifyReferences) return route.fulfill({ status: 503, json: { error: "Image could not be read. Use text instead.", referenceSubject: `character:${actorId}` } });
    return route.fulfill({ json: { prompt: body.subject, length: 100, limit: 3000, overBy: 0, directionMissing: false, sections: [], defaults: { style: "", subjects: [{ kind: "character", id: actorId, name: actor.name, description: "Saved appearance", appearance: "" }] } } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Follow @As");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(3);
  await composer.getByLabel("Direction", { exact: true }).press("Enter");
  const generate = composer.getByRole("button", { name: "Generate image draft", exact: true });
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(composer.getByRole("button", { name: "Use text instead", exact: true })).toBeVisible();
  await expect(generate).toBeDisabled();
  expect(submitted).toBe(0);
  await composer.getByRole("button", { name: "Use text instead", exact: true }).click();
  await expect(composer.getByLabel("Use existing image")).not.toBeChecked();
  await expect(composer.getByLabel("Include description")).toBeChecked();
  await expect(generate).toBeEnabled();
});

test("shows image-generation errors directly above Generate", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const panel = composer.getByRole("complementary", { name: "Prompt preview" });
  const direction = composer.getByLabel("Direction", { exact: true });
  const action = panel.getByRole("group", { name: "Image generation action" });
  const generate = action.getByRole("button", { name: "Generate image draft", exact: true });

  await direction.fill("The crew defends the hangar.");
  await expect(generate).toBeEnabled();
  await generate.click();

  const error = action.getByRole("alert");
  await expect(error).toHaveText("No paid generation in UX tests.");
  await expect(composer.locator(":scope > p[role='alert']")).toHaveCount(0);
  const errorBox = await error.boundingBox();
  const generateBox = await generate.boundingBox();
  expect(errorBox).not.toBeNull();
  expect(generateBox).not.toBeNull();
  expect(errorBox!.y + errorBox!.height).toBeLessThanOrEqual(generateBox!.y);
});
