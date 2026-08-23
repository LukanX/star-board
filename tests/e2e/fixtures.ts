import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test as base } from "@playwright/test";

const campaignMetadataFile = path.resolve("playwright/.auth/gm-campaign.json");

type CampaignMetadata = {
  campaignId: string;
  campaignName: string;
};

type E2eFixtures = {
  campaign: CampaignMetadata;
};

export const test = base.extend<E2eFixtures>({
  campaign: async ({}, provideFixture) => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(await readFile(campaignMetadataFile, "utf8")) as unknown;
    } catch (error) {
      throw new Error(`Playwright campaign metadata is unavailable. Run the setup project first: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    if (!parsed || typeof parsed !== "object" || typeof (parsed as Partial<CampaignMetadata>).campaignId !== "string" || typeof (parsed as Partial<CampaignMetadata>).campaignName !== "string") {
      throw new Error("Playwright campaign metadata is invalid. Run the setup project again.");
    }

    await provideFixture(parsed as CampaignMetadata);
  },
});

export { expect };
