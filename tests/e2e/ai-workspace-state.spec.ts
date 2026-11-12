import { expect, test } from "./fixtures";

const sharedWorkspaces = [
  {
    path: "npcs",
    add: "ADD NPC",
    fields: [
      { label: "Name", value: "Tess Varo" },
      { label: "Species", value: "Android" },
      { label: "Role", value: "Navigator" },
    ],
  },
  {
    path: "factions",
    add: "ADD FACTION",
    fields: [
      { label: "Name", value: "The Lanterns" },
      { label: "Status", value: "Active" },
    ],
  },
  {
    path: "jobs",
    add: "NEW MISSION",
    fields: [{ label: "Title", value: "Recover the relay" }],
  },
];

for (const workspace of sharedWorkspaces) {
  test(`${workspace.path} AI direction preserves prefilled details`, async ({ page, campaign }) => {
    await page.route("**/api/ai/models**", (route) =>
      route.fulfill({ status: 200, json: { status: "live", models: [] } }),
    );
    await page.goto(`/campaigns/${campaign.campaignId}/${workspace.path}`);
    await page.getByRole("button", { name: workspace.add, exact: true }).click();
    const form = page.locator("form.character-form");
    for (const field of workspace.fields) {
      await form.getByLabel(field.label, { exact: true }).fill(field.value);
    }
    await page.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
    const assistant = page.locator("[data-ai-draft-assistant]");
    for (const field of workspace.fields) {
      await expect(assistant.getByLabel(field.label, { exact: true })).toHaveValue(field.value);
    }

    const direction = assistant.getByRole("textbox", { name: "GM direction" });
    await direction.click();
    for (const field of workspace.fields) {
      await expect(assistant.getByLabel(field.label, { exact: true })).toHaveValue(field.value);
    }
    await direction.fill("A mysterious new development.");
    for (const field of workspace.fields) {
      await expect(assistant.getByLabel(field.label, { exact: true })).toHaveValue(field.value);
    }
  });
}

test("enemy AI direction preserves its separate prefilled brief", async ({ page, campaign }) => {
  await page.goto(`/campaigns/${campaign.campaignId}/enemies`);
  await page.getByRole("button", { name: "ADD ENEMY", exact: true }).click();
  const editor = page.locator('[data-enemy-editor="true"]');
  const form = editor.locator("form.character-form");
  await form.getByLabel("Name", { exact: true }).fill("Rift stalker");
  await form.getByLabel("Level", { exact: true }).fill("4");
  await editor.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();

  const brief = editor.locator("section").filter({ hasText: "ENEMY STARTING BRIEF" });
  const name = brief.getByLabel("Name", { exact: true });
  const level = brief.getByLabel("Level", { exact: true });
  await expect(name).toHaveValue("Rift stalker");
  await expect(level).toHaveValue("4");
  const direction = brief.getByRole("textbox", { name: "Concept / direction" });
  await direction.click();
  await direction.fill("An ambush predator.");
  await expect(name).toHaveValue("Rift stalker");
  await expect(level).toHaveValue("4");
});
