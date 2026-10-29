import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { enemyStatBlockSchema } from "../../lib/validation/enemy";

test("keeps the recall knowledge checkbox compact and aligned in both enemy editors", async ({ page, campaign }) => {
  await page.route("**/api/ai/enemy", async (route) => {
    const statBlock = enemyStatBlockSchema.parse({ schemaVersion: 1 });
    statBlock.defenses.armorClass = 18;
    statBlock.defenses.hitPoints = [{ label: "HP", value: 30, notes: "" }];
    await route.fulfill({ status: 200, json: { references: [], draft: {
      name: "Recall test", playerDescription: "A test creature.", level: 1, size: "medium", rarity: "common",
      traits: [], family: null, statBlock,
      gmNotesMarkdown: "", artSubject: "",
    } } });
  });
  await page.goto(`/campaigns/${campaign.campaignId}/enemies`);
  await page.getByRole("button", { name: "ADD ENEMY", exact: true }).click();
  const editor = page.locator('[data-enemy-editor="true"]');

  for (const workspace of ["manual", "ai"]) {
    if (workspace === "ai") {
      await editor.getByRole("button", { name: "OPEN AI WORKSPACE", exact: true }).click();
      await editor.getByRole("button", { name: "GENERATE DRAFT", exact: true }).click();
      await expect(editor.getByRole("button", { name: "USE DRAFT", exact: true })).toBeVisible();
    }
    const checkbox = editor.getByRole("checkbox", { name: "Include recall knowledge", exact: true });
    const panel = checkbox.locator("xpath=ancestor::section[1]");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await checkbox.evaluate((input) => {
        const label = input.closest("label")!;
        const box = input.getBoundingClientRect();
        const text = label.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left - text.left,
          centerOffset: Math.abs((box.top + box.height / 2) - (text.top + text.height / 2)),
          labelDisplay: getComputedStyle(label).display };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(14);
      expect(geometry.width).toBeLessThanOrEqual(18);
      expect(geometry.height).toBeGreaterThanOrEqual(14);
      expect(geometry.height).toBeLessThanOrEqual(18);
      expect(geometry.left).toBeLessThanOrEqual(2);
      expect(geometry.centerOffset).toBeLessThanOrEqual(2);
      expect(geometry.labelDisplay).toContain("flex");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await expect(panel.getByText("No recall knowledge recorded.")).toBeVisible();
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).toHaveCSS("outline-width", "2px");
    await expect(checkbox).toHaveCSS("outline-style", "solid");
    await expect(checkbox).toBeChecked();
    await expect(panel.getByLabel("DC", { exact: true })).toBeVisible();
    await checkbox.press("Space");
    await expect(checkbox).not.toBeChecked();
    await expect(panel.getByText("No recall knowledge recorded.")).toBeVisible();
  }
});

test("creates and hydrates a readable enemy stat block", async ({ page, campaign }) => {
  const enemyName = `Playwright Threat ${Date.now()}`;
  let apiUrl = "";
  let enemyId: string | null = null;

  try {
    await page.goto(`/campaigns/${campaign.campaignId}/enemies`);
    apiUrl = new URL(`/api/campaigns/${campaign.campaignId}/enemies`, page.url()).toString();
    await page.getByRole("button", { name: "ADD ENEMY", exact: true }).click();

    const editor = page.locator('[data-enemy-editor="true"]');
    await expect(editor).toBeVisible();
    const form = editor.locator("form.character-form");
    await form.getByLabel("Name", { exact: true }).fill(enemyName);
    await form.getByLabel("Level", { exact: true }).fill("4");
    await form.locator("select").nth(0).selectOption("medium");
    await form.locator("select").nth(1).selectOption("common");
    await form.getByLabel("Traits / type", { exact: true }).fill("aberration, occult");
    await form.getByLabel("Player-safe description", { exact: true }).fill("A threat assembled for the editor workflow.");
    await expect(form.getByRole("button", { name: "Remove aberration trait" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Remove occult trait" })).toBeVisible();

    await form.getByLabel("Armor class", { exact: true }).fill("20");
    const hitPoints = form.locator('[data-enemy-repeatable="hit points"]');
    await hitPoints.getByRole("button", { name: "Add hit point pool" }).click();
    await hitPoints.getByLabel("Label", { exact: true }).fill("HP");
    await hitPoints.getByLabel("Value", { exact: true }).fill("120");

    const movement = form.locator('[data-enemy-repeatable="movement"]');
    await movement.getByRole("button", { name: "Add movement mode" }).click();
    await movement.getByLabel("Mode", { exact: true }).fill("land");
    await movement.getByLabel("Speed", { exact: true }).fill("30 feet");

    const strikes = form.locator('[data-enemy-repeatable="strikes"]');
    await strikes.getByRole("button", { name: "Add strike" }).click();
    await strikes.getByLabel("Name", { exact: true }).fill("Void blade");
    await strikes.getByLabel("Activation", { exact: true }).fill("one-action");
    await strikes.getByLabel("Attack modifier", { exact: true }).fill("12");
    await strikes.getByRole("button", { name: "Add damage part" }).click();
    await strikes.getByLabel("Formula", { exact: true }).fill("2d6+3");
    await strikes.getByLabel("Type", { exact: true }).fill("slashing");
    await strikes.getByLabel("Reach", { exact: true }).fill("10 feet");
    await strikes.getByLabel("Range", { exact: true }).fill("30 feet");
    await strikes.getByLabel("Rider", { exact: true }).fill("The target is off-guard.");
    await strikes.getByRole("button", { name: "Add strike trait" }).click();
    await strikes.getByLabel("strike trait 1", { exact: true }).fill("agile");

    const spellcasting = form.locator('[data-enemy-repeatable="spellcasting"]');
    await spellcasting.getByRole("button", { name: "Add spellcasting group" }).click();
    await spellcasting.getByLabel("Tradition", { exact: true }).fill("occult");
    await spellcasting.getByLabel("DC", { exact: true }).fill("25");
    await spellcasting.getByLabel("Attack modifier", { exact: true }).fill("17");
    await spellcasting.getByRole("button", { name: "Add spell entry" }).click();
    await spellcasting.getByRole("combobox", { name: "Rank", exact: true }).selectOption("3rd");
    await spellcasting.getByRole("button", { name: "Add spell", exact: true }).click();
    await spellcasting.getByLabel("spell 1", { exact: true }).fill("mindlink");
    await spellcasting.getByLabel("Uses", { exact: true }).fill("At will");

    const specialAbilities = form.locator('[data-enemy-repeatable="special abilities"]');
    await specialAbilities.getByRole("button", { name: "Add special ability" }).click();
    await specialAbilities.getByLabel("Name", { exact: true }).fill("Phase step");
    await specialAbilities.getByRole("combobox", { name: "Activation", exact: true }).selectOption("two-actions");
    await specialAbilities.getByRole("button", { name: "Add ability trait" }).click();
    await specialAbilities.getByLabel("ability trait 1", { exact: true }).fill("teleportation");
    await specialAbilities.getByLabel("Requirements", { exact: true }).fill("The creature is not immobilized.");
    await specialAbilities.getByLabel("Frequency", { exact: true }).fill("once per round");
    await specialAbilities.getByLabel("Area", { exact: true }).fill("20-foot burst");
    await specialAbilities.getByLabel("Save", { exact: true }).fill("Reflex DC 25");
    await specialAbilities.getByLabel("Effect", { exact: true }).fill("The creature shifts out of phase.");

    const createResponsePromise = page.waitForResponse((response) => response.url() === apiUrl && response.request().method() === "POST");
    await form.getByRole("button", { name: "SAVE ENEMY", exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = (await createResponse.json()) as { enemy?: { id?: string } };
    enemyId = createPayload.enemy?.id ?? null;
    expect(enemyId).toBeTruthy();

    await expect(editor).toHaveCount(0);
    await page.getByRole("link", { name: "OPEN FULL RECORD", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/enemies/${enemyId}$`));
    const exportResponsePromise = page.waitForResponse((response) => response.url().includes(`/enemies/${enemyId}/export/foundry`), { timeout: 15000 });
    await page.getByRole("button", { name: "Export enemy to Foundry VTT", exact: true }).click();
    const exportResponse = await exportResponsePromise;
    const exportResponseBody = await exportResponse.text();
    expect(exportResponse.ok(), exportResponseBody).toBeTruthy();
    const exportReview = page.getByRole("region", { name: "Foundry export warnings" });
    await expect(exportReview).toBeVisible({ timeout: 10000 });
    await expect(exportReview).toContainText("Some entries are text-only or need manual setup in Foundry.");
    const downloadPromise = page.waitForEvent("download");
    await exportReview.getByRole("button", { name: "DOWNLOAD WITH WARNINGS", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-foundry-actor\.json$/);
    const downloadPath = await download.path();
    const exportedActor = JSON.parse(await readFile(downloadPath, "utf8")) as Record<string, unknown>;
    expect(exportedActor.name).toBe(enemyName);
    expect(exportedActor.type).toBe("npc");
    expect(exportedActor).not.toHaveProperty("campaign_id");
    expect(exportedActor).not.toHaveProperty("gm_notes_markdown");
    expect(exportedActor).not.toHaveProperty("source_snapshot");
    expect(JSON.stringify(exportedActor)).not.toContain(campaign.campaignId);

    const statBlock = page.locator('[data-enemy-stat-block="true"]');
    await expect(statBlock).toContainText("120");
    await expect(statBlock).toContainText("30 feet");
    await expect(statBlock).toContainText("2d6+3");
    await expect(statBlock).toContainText("mindlink");
    await expect(statBlock).toContainText("Phase step");
    await expect(statBlock).toContainText("ATK +12");
    await expect(statBlock).toContainText("DC 25");
    await expect(statBlock).toContainText("ATK +17");
    const leftAlignedHeadingMetrics = await statBlock.evaluate((block) => {
      const selectors = [
        ["[data-enemy-strike-heading=\"true\"]", "[data-enemy-strike-name=\"true\"]", "[data-enemy-strike-attack=\"true\"]"],
        ["[data-enemy-spellcasting-heading=\"true\"]", "[data-enemy-spellcasting-name=\"true\"]", "[data-enemy-spellcasting-metrics=\"true\"]"],
        ["[data-enemy-special-ability-heading=\"true\"]", "[data-enemy-special-ability-name=\"true\"]", "[data-enemy-special-ability-action=\"true\"]"],
      ];
      return selectors.map(([headingSelector, nameSelector, metricSelector]) => {
        const heading = block.querySelector(headingSelector);
        const name = block.querySelector(nameSelector);
        const metric = block.querySelector(metricSelector);
        if (!heading || !name || !metric) throw new Error("Heading metric anchors are missing.");
        const headingRect = heading.getBoundingClientRect();
        const nameRect = name.getBoundingClientRect();
        const metricRect = metric.getBoundingClientRect();
        return {
          metricAfterName: metricRect.left >= nameRect.right - 0.5,
          metricOffset: metricRect.left - headingRect.left,
          headingHalfWidth: headingRect.width / 2,
        };
      });
    });
    for (const geometry of leftAlignedHeadingMetrics) {
      expect(geometry.metricAfterName).toBe(true);
      expect(geometry.metricOffset).toBeLessThan(geometry.headingHalfWidth);
    }
    const strikeDetails = statBlock.locator('[data-enemy-strike-details="true"]');
    await expect(strikeDetails).toContainText("10 feet");
    await expect(strikeDetails).toContainText("30 feet");
    await expect(strikeDetails).toContainText("agile");
    await expect(strikeDetails).not.toContainText("Multiple attack penalty");
    const strikeDetailLabels = await strikeDetails.locator('[data-enemy-compact-line="true"] strong').allTextContents();
    expect(strikeDetailLabels).toEqual(["Activation", "Reach", "Range", "Traits"]);
    const strikeDetailsStyles = await strikeDetails.evaluate((details) => {
      const rangeLine = Array.from(details.querySelectorAll('[data-enemy-compact-line="true"]')).find((line) => line.querySelector("strong")?.textContent === "Range");
      if (!rangeLine) throw new Error("Range detail line is missing.");
      return {
        borderBottomWidth: getComputedStyle(details).borderBottomWidth,
        detailsWidth: details.getBoundingClientRect().width,
        rangeWidth: rangeLine.getBoundingClientRect().width,
      };
    });
    expect(strikeDetailsStyles.borderBottomWidth).toBe("1px");
    expect(strikeDetailsStyles.detailsWidth).toBeGreaterThan(strikeDetailsStyles.rangeWidth);
    const riderLine = statBlock.locator('[data-enemy-compact-line="true"]').filter({ hasText: /^Rider/ }).first();
    await expect(riderLine).toContainText("The target is off-guard.");
    const strikeDetailsBox = await strikeDetails.boundingBox();
    const riderBox = await riderLine.boundingBox();
    expect(strikeDetailsBox).not.toBeNull();
    expect(riderBox).not.toBeNull();
    expect(riderBox!.y).toBeGreaterThanOrEqual(strikeDetailsBox!.y + strikeDetailsBox!.height - 0.5);
    const actionMetadata = statBlock.locator('[data-enemy-action-metadata="true"]');
    await expect(actionMetadata).toContainText("Reflex DC 25");
    const actionMetadataGeometry = await actionMetadata.evaluate((metadata) => {
      const previousSection = metadata.previousElementSibling;
      const cells = Array.from(metadata.children);
      if (!previousSection || !cells.length) throw new Error("Action metadata geometry anchors are missing.");
      const previousRect = previousSection.getBoundingClientRect();
      const cellRects = cells.map((cell) => cell.getBoundingClientRect());
      return {
        previousText: previousSection.textContent,
        gaps: cellRects.map((cellRect) => cellRect.top - previousRect.bottom),
        previousBorderBottom: getComputedStyle(previousSection).borderBottomWidth,
        cellBorderRights: cells.map((cell) => getComputedStyle(cell).borderRightWidth),
        firstCellPaddingLeft: getComputedStyle(cells[0]).paddingLeft,
        cellPaddingBottoms: cells.map((cell) => getComputedStyle(cell).paddingBottom),
      };
    });
    expect(actionMetadataGeometry.previousText).toContain("Requirements");
    expect(actionMetadataGeometry.gaps, JSON.stringify(actionMetadataGeometry)).toEqual([0, 0, 0]);
    expect(actionMetadataGeometry.previousBorderBottom).toBe("1px");
    expect(actionMetadataGeometry.cellBorderRights).toEqual(["1px", "1px", "0px"]);
    expect(actionMetadataGeometry.firstCellPaddingLeft).toBe("0px");
    expect(actionMetadataGeometry.cellPaddingBottoms).toEqual(["13px", "13px", "13px"]);
    const compactLineGeometry = await statBlock.locator('[data-enemy-compact-line="true"]').evaluateAll((lines) => lines.map((line) => {
      const label = line.querySelector("strong");
      const value = label?.nextElementSibling;
      if (!label || !value) throw new Error("Compact line content is missing.");
      return {
        label: label.textContent,
        display: getComputedStyle(line).display,
        gap: value.getBoundingClientRect().left - label.getBoundingClientRect().right,
      };
    }));
    for (const label of ["Uses", "Traits", "Requirements", "Effect"]) {
      const line = compactLineGeometry.find((candidate) => candidate.label === label);
      expect(line, JSON.stringify(compactLineGeometry)).toEqual(expect.objectContaining({ label, display: "flex" }));
      expect(line?.gap, JSON.stringify(compactLineGeometry)).toBeLessThanOrEqual(6.5);
    }
    const actionGlyph = statBlock.locator('[data-action-glyph="two-actions"]');
    await expect(actionGlyph).toBeVisible();
    await expect(actionGlyph.locator(".font-actions")).toHaveCSS("font-family", /Pathfinder2eActions/i);
    const actionFontResponse = await page.request.get(new URL("/Pathfinder2eActions.ttf", page.url()).toString());
    expect(actionFontResponse.ok()).toBeTruthy();
    expect((await actionFontResponse.body()).byteLength).toBe(3920);
    await expect(statBlock.locator('[data-enemy-stat-summary="true"]')).toBeVisible();
    for (const section of ["awareness", "capabilities", "defenses", "offense"]) await expect(statBlock.locator(`[data-enemy-section="${section}"]`)).toBeVisible();
    const sectionBottomBorders = await statBlock.locator('[data-enemy-section]').evaluateAll((sections) => sections.map((section) => ({
      section: section.getAttribute("data-enemy-section"),
      borderBottomWidth: getComputedStyle(section).borderBottomWidth,
    })));
    expect(sectionBottomBorders).toEqual([
      { section: "awareness", borderBottomWidth: "1px" },
      { section: "capabilities", borderBottomWidth: "1px" },
      { section: "defenses", borderBottomWidth: "1px" },
      { section: "offense", borderBottomWidth: "1px" },
    ]);
    const bodyOrder = await page.locator('[data-archive-record-body="true"]').evaluate((body) => Array.from(body.children).map((child) => {
      if (child.getAttribute("data-enemy-stat-block") === "true") return "mechanics";
      if (child.getAttribute("data-enemy-player-notes") === "true") return "player brief";
      if (child.getAttribute("data-enemy-gm-notes") === "true") return "GM notes";
      if (child.textContent?.includes("SOURCE PROVENANCE")) return "provenance";
      return "other";
    }));
    expect(bodyOrder).toEqual(["mechanics", "player brief", "GM notes"]);
    const desktopDimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(desktopDimensions.scrollWidth).toBeLessThanOrEqual(desktopDimensions.clientWidth);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(statBlock.locator('[data-enemy-stat-summary="true"]')).toBeVisible();
    const detailMobileDimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(detailMobileDimensions.scrollWidth).toBeLessThanOrEqual(detailMobileDimensions.clientWidth);

    await page.reload();
    await expect(page.locator('[data-enemy-stat-block="true"]')).toContainText("Void blade");
    await page.getByRole("button", { name: `Edit ${enemyName}`, exact: true }).click();
    const hydratedEditor = page.locator('[data-enemy-editor="true"]');
    const hydratedForm = hydratedEditor.locator("form.character-form");
    await expect(hydratedForm.locator('input[required][maxlength="160"]')).toHaveValue(enemyName);
    await expect(hydratedForm.getByRole("button", { name: "Remove aberration trait" })).toBeVisible();
    await expect(hydratedForm.getByRole("button", { name: "Remove occult trait" })).toBeVisible();
    await expect(hydratedForm.getByLabel("Value", { exact: true })).toHaveValue("120");
    await expect(hydratedForm.getByLabel("Speed", { exact: true })).toHaveValue("30 feet");
    await expect(hydratedForm.locator('[data-enemy-repeatable="strikes"]').getByLabel("Name", { exact: true })).toHaveValue("Void blade");
    await expect(hydratedEditor.locator('[data-enemy-repeatable="special abilities"]').getByRole("textbox", { name: "Effect", exact: true })).toHaveValue("The creature shifts out of phase.");

    const textareaValues = await hydratedEditor.locator("textarea").evaluateAll((elements) => elements.map((element) => (element as HTMLTextAreaElement).value));
    expect(textareaValues.some((value) => value.includes('"schemaVersion"'))).toBe(false);

    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  } finally {
    if (enemyId) {
      await page.request.delete(new URL(`/api/campaigns/${campaign.campaignId}/enemies/${enemyId}`, page.url()).toString());
    }
  }
});
