import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { ensureLocalGmCampaign } from "./support/local-auth";

const authFile = path.resolve("playwright/.auth/gm.json");
const campaignMetadataFile = path.resolve("playwright/.auth/gm-campaign.json");

setup("authenticate the local GM", async ({ page }) => {
  const { campaignId, campaignName, credentials } = await ensureLocalGmCampaign();

  await page.goto(`/login?mode=signin&next=${encodeURIComponent(`/campaigns/${campaignId}`)}`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));
  await expect(page.locator("[data-campaign-shell]")).toHaveCount(1);

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
  await writeFile(campaignMetadataFile, JSON.stringify({ campaignId, campaignName }, null, 2), "utf8");
});
