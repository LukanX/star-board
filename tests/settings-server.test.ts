import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCampaignRouteAccess: vi.fn(),
}));

vi.mock("@/lib/campaign/server", () => ({
  getCampaignRouteAccess: mocks.getCampaignRouteAccess,
}));

import { getCampaignSettings } from "@/lib/campaign/settings-server";

const campaignId = "00000000-0000-4000-8000-000000000001";

describe("campaign Settings server access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without checking membership when the user is unauthenticated", async () => {
    mocks.getCampaignRouteAccess.mockResolvedValue(null);

    await expect(getCampaignSettings(campaignId)).resolves.toBeNull();
    expect(mocks.getCampaignRouteAccess).toHaveBeenCalledWith(campaignId);
  });

  it("returns null when the user is not a campaign member", async () => {
    mocks.getCampaignRouteAccess.mockResolvedValue(null);

    await expect(getCampaignSettings(campaignId)).resolves.toBeNull();
  });

  it("returns null for a campaign player even when membership exists", async () => {
    mocks.getCampaignRouteAccess.mockResolvedValue({
      role: "player",
      displayName: "Pilot",
      campaign: { name: "Signal Lost", description: "A missing ship." },
    });

    await expect(getCampaignSettings(campaignId)).resolves.toBeNull();
  });

  it("returns the GM settings access contract for a campaign member", async () => {
    mocks.getCampaignRouteAccess.mockResolvedValue({
      role: "gm",
      displayName: "Director",
      campaign: { name: "Signal Lost", description: "A missing ship." },
    });

    await expect(getCampaignSettings(campaignId)).resolves.toEqual({
      role: "gm",
      displayName: "Director",
      campaign: { name: "Signal Lost", description: "A missing ship." },
    });
    expect(mocks.getCampaignRouteAccess).toHaveBeenCalledWith(campaignId);
  });
});