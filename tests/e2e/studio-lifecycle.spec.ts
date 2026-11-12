import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import type { ImageDraft } from "../../lib/ai/image-job-polling";
import type { StudioComposition } from "../../lib/validation/studio";

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eX8AAAAASUVORK5CYII=";
function imageDraft(body: { targetKind: "scene" | "battlemap"; subject: string; studio: StudioComposition; currentPrompt: string }): ImageDraft {
  return {
    generationRunId: randomUUID(), targetKind: body.targetKind, purpose: "studio-art", mode: "create", subject: body.subject,
    prompt: body.currentPrompt, aspectRatio: "1:1", provider: "openrouter", model: "test/image", createdAt: new Date().toISOString(),
    studioManifest: { direction: body.subject, composition: body.studio, sources: [], references: [], style: "" },
    image: { url: null, mediaType: "image/png", base64: pixel },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/ai/image", (route) => route.fulfill({ status: 503, json: { error: "No paid providers in lifecycle tests." } }));
  await page.route("**/api/ai/art-prompt", (route) => route.fulfill({ status: 503, json: { error: "No paid providers in lifecycle tests." } }));
  await page.route("**/api/ai/models**", (route) => {
    const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
    return route.fulfill({ json: { status: "live", defaultModel: `test/${capability}`, models: [{
      id: `test/${capability}`, label: "Local test model", capability, enabled: true, compatible: true, available: true,
      inputModalities: ["text", "image"], supportedParameters: ["aspect_ratio"], parameterValues: { aspect_ratio: ["1:1", "16:9"] },
      description: "", providerName: "test", pricing: null,
    }] } });
  });
});

test("opens a fresh composition after reload rather than restoring the working form", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Abandoned composition");
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Abandoned composition");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
});

test("migrates legacy jobs without restoring the old form or automatically polling", async ({ page, campaign }) => {
  let draft: ImageDraft;
  let lookups = 0;
  await page.route("**/api/ai/image", (route) => {
    draft = imageDraft(route.request().postDataJSON());
    return route.fulfill({ json: { draft } });
  });
  await page.route("**/api/ai/image/*", (route) => {
    lookups++;
    return route.fulfill({ json: { job: { status: "complete", image: draft.image, model: draft.model, createdAt: draft.createdAt } } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Legacy composition must not return");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((value) => value.startsWith("star-board:campaign-studio:jobs:v2:"))!;
    const recovery = JSON.parse(sessionStorage.getItem(key)!);
    const legacyKey = key.replace("star-board:campaign-studio:jobs:v2:", "star-board:campaign-studio:v1:");
    sessionStorage.setItem(legacyKey, JSON.stringify({ form: { kind: "scene", direction: "Legacy composition must not return" }, jobs: recovery.jobs }));
    sessionStorage.removeItem(key);
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
  await expect(composer.getByRole("button", { name: "Recover previous image jobs", exact: true })).toBeVisible();
  expect(lookups).toBe(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith("star-board:campaign-studio:v1:")))).toBe(false);
  await composer.getByRole("button", { name: "Recover previous image jobs", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  expect(lookups).toBe(1);
});

test("preserves Battlemap mode when redoing a recovered Battlemap draft", async ({ page, campaign }) => {
  const drafts = new Map<string, ImageDraft>();
  await page.route("**/api/ai/image", async (route) => {
    const body = route.request().postDataJSON() as Parameters<typeof imageDraft>[0];
    const draft = imageDraft(body);
    drafts.set(draft.generationRunId, draft);
    return route.fulfill({ json: { job: { ...draft, status: "pending" } } });
  });
  await page.route("**/api/ai/image/*", async (route) => {
    const generationRunId = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    const draft = drafts.get(generationRunId);
    if (!draft) return route.fulfill({ status: 404, json: { error: "Image generation job was not found." } });
    return route.fulfill({ json: { job: {
      generationRunId,
      status: "complete",
      image: { base64: null, url: `data:image/png;base64,${pixel}`, mediaType: "image/png" },
      model: draft.model,
      createdAt: draft.createdAt,
      temporaryPath: `${campaign.campaignId}/00000000-0000-4000-8000-000000000002/studio-draft-${generationRunId}.png`,
    } } });
  });

  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByRole("button", { name: "Battlemap", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("A tactical station map");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  expect([...drafts.values()][0].targetKind).toBe("battlemap");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await composer.getByRole("button", { name: "Recover previous image jobs", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Redo with changes" }).click();

  await expect(composer.getByRole("button", { name: "Battlemap", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(composer.getByRole("heading", { name: "Place (optional)", exact: true })).toBeVisible();
  await expect(composer.getByRole("img", { name: "Original draft to redo" })).toBeVisible();
});

test("keeps a completed image usable and retries authoritative job metadata after storage failure", async ({ page, campaign }) => {
  let draft: ImageDraft;
  await page.route("**/api/ai/image", (route) => {
    draft = imageDraft(route.request().postDataJSON());
    return route.fulfill({ json: { draft } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Recoverable despite storage failure");
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    sessionStorage.setItem("studio-test-storage-failure", "yes");
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("star-board:campaign-studio:jobs:v2:") && this.getItem("studio-test-storage-failure") === "yes") throw new DOMException("Test quota failure", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await expect(composer.getByRole("alert").filter({ hasText: "recovery metadata could not be saved" })).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem("studio-test-storage-failure"));
  await composer.getByRole("button", { name: "Retry browser storage", exact: true }).click();
  await expect(composer.getByRole("alert").filter({ hasText: "recovery metadata could not be saved" })).toHaveCount(0);
  const ids = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((value) => value.startsWith("star-board:campaign-studio:jobs:v2:"))!;
    return JSON.parse(sessionStorage.getItem(key)!).jobs.map((job: { generationRunId: string }) => job.generationRunId);
  });
  expect(ids).toEqual([draft!.generationRunId]);
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
});

test("guards campaign links and explicitly restores a checkpoint after returning", async ({ page, campaign }) => {
  const path = `/campaigns/${campaign.campaignId}`;
  await page.goto(`${path}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Checkpoint for later");
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("Working version");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("link", { name: "Job board", exact: true }).click();
  await expect(page).toHaveURL(`${path}/ai-studio`);
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Working version");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("link", { name: "Job board", exact: true }).click();
  await expect(page).toHaveURL(`${path}/jobs`);
  await page.getByRole("link", { name: "AI Studio", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Checkpoint for later");
});

test("confirms checkpoint replacement, restores settings explicitly and deletes only the checkpoint", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const direction = composer.getByLabel("Direction", { exact: true });
  await composer.getByLabel("Image aspect ratio", { exact: true }).selectOption("16:9");
  await direction.fill("First checkpoint");
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await direction.fill("Second checkpoint");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(direction).toHaveValue("Second checkpoint");
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(direction).toHaveValue("First checkpoint");
  await expect(composer.getByLabel("Image aspect ratio", { exact: true })).toHaveValue("16:9");
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "Delete saved composition", exact: true }).click();
  await expect(composer.getByRole("button", { name: "Resume composition", exact: true })).toHaveCount(0);
  await expect(direction).toHaveValue("First checkpoint");
});

test("starts fresh through browser history while preserving an explicit checkpoint", async ({ page, campaign }) => {
  const path = `/campaigns/${campaign.campaignId}`;
  await page.goto(path);
  await page.getByRole("link", { name: "AI Studio", exact: true }).click();
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Saved before history navigation");
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("Abandoned by browser Back");
  await page.goBack();
  await expect(page).toHaveURL(path);
  await page.goForward();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Saved before history navigation");
});

test("ignores late prompt assistance after a confirmed fresh start", async ({ page, campaign }) => {
  let release!: () => void;
  let finished!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const delivered = new Promise<void>((resolve) => { finished = resolve; });
  await page.route("**/api/ai/art-prompt", async (route) => {
    await delayed;
    await route.fulfill({ json: { draft: { prompt: "Abandoned assistance candidate" }, allowance: 600 } });
    finished();
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Old assistance request");
  const submitted = page.waitForRequest("**/api/ai/art-prompt");
  await composer.getByRole("button", { name: "Rewrite direction with AI", exact: true }).click();
  await submitted;
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("Fresh composition");
  release();
  await delivered;
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Fresh composition");
  await expect(composer.getByText("Abandoned assistance candidate", { exact: true })).toHaveCount(0);
  await expect(composer.getByRole("button", { name: "Rewrite direction with AI", exact: true })).toBeEnabled();
});

test("ignores a late prompt preview after reset and keeps generation bound to the new inputs", async ({ page, campaign }) => {
  let release!: () => void;
  let finished!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const delivered = new Promise<void>((resolve) => { finished = resolve; });
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/preview`, async (route) => {
    const body = route.request().postDataJSON();
    if (body.subject === "Delayed old preview") await delayed;
    await route.fulfill({ json: { prompt: `Prompt for ${body.subject}`, length: 100, limit: 3000, overBy: 0, directionMissing: !body.subject, sections: [], defaults: { style: "", subjects: [] } } });
    if (body.subject === "Delayed old preview") finished();
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const submitted = page.waitForRequest((request) => request.url().endsWith("/studio/preview") && request.postDataJSON().subject === "Delayed old preview");
  await composer.getByLabel("Direction", { exact: true }).fill("Delayed old preview");
  await submitted;
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("Latest new composition");
  release(); await delivered;
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await composer.getByText("Final prompt", { exact: true }).click();
  await expect(composer.locator("pre")).toHaveText("Prompt for Latest new composition");
});

test("stops abandoned polling and only recovers the original job on request", async ({ page, campaign }) => {
  let draft: ImageDraft;
  let release!: () => void;
  let finished!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const delivered = new Promise<void>((resolve) => { finished = resolve; });
  let lookups = 0;
  await page.route("**/api/ai/image", (route) => {
    draft = imageDraft(route.request().postDataJSON());
    return route.fulfill({ json: { job: { ...draft, status: "pending" } } });
  });
  await page.route("**/api/ai/image/*", async (route) => {
    lookups++;
    if (lookups === 1) await delayed;
    await route.fulfill({ json: { job: { status: "complete", image: draft.image, model: draft.model, createdAt: draft.createdAt } } });
    if (lookups === 1) finished();
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Queued original image");
  const polling = page.waitForRequest("**/api/ai/image/*");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await polling;
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("New work after abandoning polling");
  release(); await delivered;
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toHaveCount(0);
  expect(lookups).toBe(1);
  await composer.getByRole("button", { name: "Recover previous image jobs", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  expect(lookups).toBe(2);
  await composer.getByRole("button", { name: "Back to compose", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("New work after abandoning polling");
});

test("surfaces unavailable checkpoint choices instead of silently substituting a model or ratio", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Unavailable saved choices");
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((value) => value.startsWith("star-board:campaign-studio:checkpoint:v2:"))!;
    const checkpoint = JSON.parse(sessionStorage.getItem(key)!);
    checkpoint.inputs.model = "removed/image"; checkpoint.inputs.aspectRatio = "3:4";
    sessionStorage.setItem(key, JSON.stringify(checkpoint));
  });
  await page.reload();
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(composer.getByRole("alert").filter({ hasText: "removed/image is no longer available" })).toBeVisible();
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeDisabled();
  await composer.getByLabel("Image generation model", { exact: true }).selectOption("test/image");
  await expect(composer.locator("p").filter({ hasText: /^Choose an aspect ratio supported by this model\.$/ })).toBeVisible();
  await composer.getByLabel("Image aspect ratio", { exact: true }).selectOption("16:9");
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
});

test("keeps unavailable resumed subjects visible until explicitly removed", async ({ page, campaign }) => {
  await page.route("**/entities/preview**", (route) => route.fulfill({ status: 404, json: { error: "Selected Place is no longer available." } }));
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Composition with an unavailable Place");
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((value) => value.startsWith("star-board:campaign-studio:checkpoint:v2:"))!;
    const checkpoint = JSON.parse(sessionStorage.getItem(key)!);
    const id = "dff51509-f1ca-4ebc-b1bc-b6afbb292a25";
    checkpoint.inputs.form.composition.subjects = [{ kind: "place", id, useImage: false }];
    checkpoint.inputs.form.names = { [`place:${id}`]: "Vanished Place" };
    sessionStorage.setItem(key, JSON.stringify(checkpoint));
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(composer.getByRole("list", { name: "Selected Place" })).toContainText("Vanished Place");
  await expect(composer.getByRole("alert").filter({ hasText: "Selected Place is no longer available." })).toBeVisible();
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeDisabled();
  await composer.getByRole("button", { name: "Remove Vanished Place", exact: true }).click();
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await expect(composer.getByRole("alert")).toHaveCount(0);
});

test("confirms sign out and clears only scoped Studio data", async ({ page, campaign }) => {
  await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204 }));
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Unsaved before sign out");
  await page.evaluate(() => {
    sessionStorage.setItem("unrelated-studio-test", "keep");
    sessionStorage.setItem("star-board:campaign-studio:checkpoint:v2:other:user", "{}");
  });
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Unsaved before sign out");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login\?next=\/campaigns$/);
  const storage = await page.evaluate(() => Object.keys(sessionStorage));
  expect(storage.some((key) => key.startsWith("star-board:campaign-studio:"))).toBe(false);
  expect(storage).toContain("unrelated-studio-test");
});

test("retains a late generation acknowledgement for recovery without filling the new composition", async ({ page, campaign }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let draft: ImageDraft;
  let lookups = 0;
  await page.route("**/api/ai/image", async (route) => {
    draft = imageDraft(route.request().postDataJSON());
    await delayed;
    await route.fulfill({ json: { draft } });
  });
  await page.route("**/api/ai/image/*", (route) => {
    lookups++;
    return route.fulfill({ json: { job: { status: "complete", image: draft.image, model: draft.model, createdAt: draft.createdAt } } });
  });
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { assets: [] } });
    expect(route.request().postDataJSON().manifest.direction).toBe("Original charged request");
    return route.fulfill({ status: 201, json: { asset: {} } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const direction = composer.getByLabel("Direction", { exact: true });
  await direction.fill("Original charged request");
  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/ai/image") && request.method() === "POST");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await submitted;
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("may be billed"); await dialog.accept(); });
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await direction.fill("Unrelated new composition");
  release();
  await expect(composer.getByRole("button", { name: "Recover previous image jobs", exact: true })).toBeVisible();
  expect(lookups).toBe(0);
  await expect(composer.getByLabel("Artwork title", { exact: true })).toHaveCount(0);
  await composer.getByRole("button", { name: "Recover previous image jobs", exact: true }).click();
  await composer.getByLabel("Artwork title", { exact: true }).fill("Recovered original image");
  await composer.getByRole("button", { name: "Add to library", exact: true }).click();
  await expect(page.getByRole("region", { name: "Private campaign art library" })).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(direction).toHaveValue("Unrelated new composition");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await expect(direction).toHaveValue("Unrelated new composition");
});

test("keeps the composition and draft retryable when authenticated cleanup fails", async ({ page, campaign }) => {
  await page.route("**/api/ai/image", (route) => route.fulfill({ json: { draft: imageDraft(route.request().postDataJSON()) } }));
  let deletions = 0;
  await page.route(`**/api/campaigns/${campaign.campaignId}/studio/drafts/*`, (route) => {
    deletions++;
    return route.fulfill(deletions === 1 ? { status: 503, json: { error: "Temporary cleanup failure; retry." } } : { json: { ok: true } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Preserve until cleanup succeeds");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  expect(deletions).toBe(0);
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await expect(composer.getByRole("alert")).toContainText("Temporary cleanup failure");
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Back to compose", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Preserve until cleanup succeeds");
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "New composition", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
  expect(deletions).toBe(2);
  await expect(composer.getByRole("button", { name: "Recover previous image jobs", exact: true })).toHaveCount(0);
});

test("discloses advanced text only on demand and confirms fresh starts", async ({ page, campaign }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await expect(composer.getByLabel("Style text", { exact: true })).not.toBeVisible();
  await expect(composer.locator("pre")).not.toBeVisible();
  await composer.getByLabel("Direction", { exact: true }).fill("Keep this until confirmed");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await composer.getByRole("button", { name: "New composition", exact: true }).focus();
  await composer.getByRole("button", { name: "New composition", exact: true }).press("Enter");
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Keep this until confirmed");
  page.once("dialog", (dialog) => void dialog.accept());
  await composer.getByRole("button", { name: "Battlemap", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
  await expect(composer.getByRole("button", { name: "Battlemap", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("only resumes an explicitly saved composition and preserves it when leaving", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Saved composition");
  await composer.getByRole("button", { name: "Save composition for later", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("Unsaved change");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Unsaved change");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(composer).not.toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("");
  await composer.getByRole("button", { name: "Resume composition", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveValue("Saved composition");
});

type StudioEditRequest = {
  targetKind: "scene" | "battlemap"; subject: string; studio: StudioComposition; currentPrompt: string; operation?: string; parentRunId?: string;
  edit: { instruction: string; source: { type: string; generationRunId: string; manifest: { direction: string; composition: StudioComposition } } };
};

test("redoes and edits a Studio draft while recording lineage", async ({ page, campaign }) => {
  const requests: StudioEditRequest[] = [];
  const drafts: ImageDraft[] = [];
  await page.route("**/api/ai/image", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const draft = body.operation === "edit"
      ? {
        ...imageDraft({ targetKind: body.targetKind, subject: body.edit.source.manifest.direction, studio: body.edit.source.manifest.composition, currentPrompt: "Edit prompt" }),
        mode: "refine" as const, operation: "edit" as const, parentRunId: body.edit.source.generationRunId,
      }
      : { ...imageDraft(body), ...(body.operation === "redo" ? { operation: "redo" as const, parentRunId: body.parentRunId } : {}) };
    drafts.push(draft);
    return route.fulfill({ json: { draft } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const generate = composer.getByRole("button", { name: "Generate image draft", exact: true });
  await composer.getByLabel("Direction", { exact: true }).fill("Reactor corridor");
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();

  await composer.getByRole("button", { name: "Redo with changes" }).click();
  await expect(composer.getByRole("img", { name: "Original draft to redo" })).toBeVisible();
  await expect(composer.getByRole("status").filter({ hasText: "Redoing a draft" })).toBeVisible();
  await expect(composer.getByRole("region", { name: "Original direction" })).toContainText("Reactor corridor");
  await composer.getByRole("button", { name: "Edit direction directly", exact: true }).click();
  await expect(composer.getByLabel("Direction", { exact: true })).toBeFocused();
  await composer.getByLabel("Direction", { exact: true }).fill("Reactor corridor, flooded");
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  expect(requests[1]).toMatchObject({ operation: "redo", parentRunId: drafts[0].generationRunId });

  await composer.getByLabel("Describe the change").fill("Add emergency lighting");
  await composer.getByRole("button", { name: "APPLY EDIT" }).click();
  await expect(composer.getByText("EDITING // THIS EDITED DRAFT")).toBeVisible();
  expect(requests[2]).toMatchObject({
    operation: "edit",
    edit: { instruction: "Add emergency lighting", source: { type: "draft", generationRunId: drafts[1].generationRunId } },
  });
  expect(requests[2].edit.source.manifest.direction).toBe("Reactor corridor, flooded");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("keeps the original direction visible while supporting feedback and direct redo edits", async ({ page, campaign }) => {
  const imageRequests: Array<Parameters<typeof imageDraft>[0] & { operation?: string; parentRunId?: string }> = [];
  const drafts: ImageDraft[] = [];
  const assistanceRequests: { direction: string; feedback?: string }[] = [];
  await page.route("**/api/ai/image", async (route) => {
    const body = route.request().postDataJSON() as Parameters<typeof imageDraft>[0] & { operation?: string; parentRunId?: string };
    imageRequests.push(body);
    const draft = imageDraft(body);
    drafts.push(draft);
    return route.fulfill({ json: { draft } });
  });
  await page.route("**/api/ai/art-prompt", async (route) => {
    const body = route.request().postDataJSON() as { direction: string; feedback?: string };
    assistanceRequests.push(body);
    return route.fulfill({ json: { draft: { prompt: "A revised reactor chamber with red emergency lights" }, allowance: 300 } });
  });

  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  const generate = composer.getByRole("button", { name: "Generate image draft", exact: true });
  await composer.getByLabel("Direction", { exact: true }).fill("A reactor chamber with blue lights");
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Redo with changes" }).click();

  const originalDirection = composer.getByRole("region", { name: "Original direction" });
  await expect(originalDirection).toContainText("A reactor chamber with blue lights");
  const actions = composer.getByRole("group", { name: "Redo direction actions" });
  await expect(actions.getByRole("button", { name: "Draft direction with AI", exact: true })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Edit direction directly", exact: true })).toBeVisible();
  const directionFeedback = composer.getByLabel("Direction feedback for AI", { exact: true });
  await expect(directionFeedback).toBeVisible();
  await expect(directionFeedback).toBeFocused();
  await expect(composer.getByLabel("Direction", { exact: true })).toHaveCount(0);

  await actions.getByRole("button", { name: "Edit direction directly", exact: true }).click();
  const direction = composer.getByLabel("Direction", { exact: true });
  await expect(direction).toHaveValue("A reactor chamber with blue lights");
  await direction.fill("A reactor chamber with dim blue lights");
  await composer.getByLabel("Direction feedback for AI", { exact: true }).fill("Add red emergency lights");
  await actions.getByRole("button", { name: "Draft direction with AI", exact: true }).click();

  await expect(composer.getByText("A revised reactor chamber with red emergency lights", { exact: true })).toBeVisible();
  expect(assistanceRequests[0]).toMatchObject({
    direction: "A reactor chamber with dim blue lights",
    feedback: "Add red emergency lights",
  });
  await expect(direction).toHaveValue("A reactor chamber with dim blue lights");
  await composer.getByRole("button", { name: "Apply direction", exact: true }).click();
  await expect(direction).toHaveValue("A revised reactor chamber with red emergency lights");
  await expect(originalDirection).toContainText("A reactor chamber with blue lights");

  await expect(generate).toBeEnabled();
  await generate.click();
  expect(imageRequests[1]).toMatchObject({
    operation: "redo",
    parentRunId: drafts[0].generationRunId,
    subject: "A revised reactor chamber with red emergency lights",
  });
});

test("clears unused redo feedback when stopping redo before a normal direction rewrite", async ({ page, campaign }) => {
  const assistanceRequests: { direction: string; feedback?: string }[] = [];
  await page.route("**/api/ai/image", async (route) => {
    const body = route.request().postDataJSON() as Parameters<typeof imageDraft>[0];
    return route.fulfill({ json: { draft: imageDraft(body) } });
  });
  await page.route("**/api/ai/art-prompt", async (route) => {
    assistanceRequests.push(route.request().postDataJSON() as { direction: string; feedback?: string });
    return route.fulfill({ json: { draft: { prompt: "A revised direction" }, allowance: 300 } });
  });

  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("A quiet reactor chamber");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Redo with changes" }).click();
  await composer.getByLabel("Direction feedback for AI", { exact: true }).fill("Add sparks and warning lights");
  await composer.getByRole("button", { name: "Stop redo", exact: true }).click();

  const rewrite = composer.getByRole("button", { name: "Rewrite direction with AI", exact: true });
  await expect(rewrite).toBeEnabled();
  await rewrite.click();
  await expect(composer.getByText("A revised direction", { exact: true })).toBeVisible();
  expect(assistanceRequests[0]).not.toHaveProperty("feedback");
});

test("clears unused redo feedback after generating a redo draft", async ({ page, campaign }) => {
  const assistanceRequests: { direction: string; feedback?: string }[] = [];
  await page.route("**/api/ai/image", async (route) => {
    const body = route.request().postDataJSON() as Parameters<typeof imageDraft>[0];
    return route.fulfill({ json: { draft: imageDraft(body) } });
  });
  await page.route("**/api/ai/art-prompt", async (route) => {
    assistanceRequests.push(route.request().postDataJSON() as { direction: string; feedback?: string });
    return route.fulfill({ json: { draft: { prompt: "A revised direction" }, allowance: 300 } });
  });

  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("A quiet reactor chamber");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Redo with changes" }).click();
  await composer.getByLabel("Direction feedback for AI", { exact: true }).fill("Add dust and broken panels");
  await composer.getByRole("button", { name: "Edit direction directly", exact: true }).click();
  await composer.getByLabel("Direction", { exact: true }).fill("A dusty reactor chamber with broken panels");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Back to compose", exact: true }).click();

  const rewrite = composer.getByRole("button", { name: "Rewrite direction with AI", exact: true });
  await expect(rewrite).toBeEnabled();
  await rewrite.click();
  await expect(composer.getByText("A revised direction", { exact: true })).toBeVisible();
  expect(assistanceRequests[0]).not.toHaveProperty("feedback");
});

test("preserves save details when reselecting the active draft", async ({ page, campaign }) => {
  await page.route("**/api/ai/image", async (route) => {
    const body = route.request().postDataJSON() as Parameters<typeof imageDraft>[0];
    return route.fulfill({ json: { draft: imageDraft(body) } });
  });

  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("First reactor chamber");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Back to compose", exact: true }).click();

  await composer.getByLabel("Direction", { exact: true }).fill("Second reactor chamber");
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  const savePanel = composer.getByRole("region", { name: "Add to campaign library" });
  await savePanel.getByLabel("Artwork title", { exact: true }).fill("Second draft title");
  await savePanel.getByRole("button", { name: "+ Add caption", exact: true }).click();
  const caption = savePanel.getByRole("textbox", { name: "Artwork caption", exact: true });
  await caption.fill("Caption stays with this draft.");

  await composer.getByRole("button", { name: "Draft 2", exact: true }).click();
  await expect(savePanel.getByLabel("Artwork title", { exact: true })).toHaveValue("Second draft title");
  await expect(caption).toHaveValue("Caption stays with this draft.");

  await composer.getByRole("button", { name: "Draft 1", exact: true }).click();
  await expect(savePanel.getByLabel("Artwork title", { exact: true })).toHaveValue("");
  await savePanel.getByRole("button", { name: "+ Add caption", exact: true }).click();
  await expect(savePanel.getByRole("textbox", { name: "Artwork caption", exact: true })).toHaveValue("");
});

test("disables Edit with an explanation when the model cannot accept images", async ({ page, campaign }) => {
  await page.route("**/api/ai/models**", (route) => {
    const capability = new URL(route.request().url()).searchParams.get("capability") ?? "image";
    return route.fulfill({ json: { status: "live", defaultModel: `test/${capability}`, models: [{
      id: `test/${capability}`, label: "Text-only model", capability, enabled: true, compatible: true, available: true,
      inputModalities: ["text"], supportedParameters: ["aspect_ratio"], parameterValues: { aspect_ratio: ["1:1"] },
      description: "", providerName: "test", pricing: null,
    }] } });
  });
  await page.route("**/api/ai/image", (route) => route.fulfill({ json: { draft: imageDraft(route.request().postDataJSON()) } }));
  await page.goto(`/campaigns/${campaign.campaignId}/ai-studio`);
  const composer = page.getByRole("region", { name: "AI Studio composer" });
  await composer.getByLabel("Direction", { exact: true }).fill("Reactor corridor");
  await expect(composer.getByRole("button", { name: "Generate image draft", exact: true })).toBeEnabled();
  await composer.getByRole("button", { name: "Generate image draft", exact: true }).click();
  await expect(composer.getByLabel("Artwork title", { exact: true })).toBeVisible();
  await expect(composer.getByText("cannot edit images")).toBeVisible();
  await expect(composer.getByRole("button", { name: "APPLY EDIT" })).toBeDisabled();
});
