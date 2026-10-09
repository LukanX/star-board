import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCampaignRouteAccess: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  loadCampaignNarrativeSettings: vi.fn(),
}));

vi.mock("@/lib/campaign/server", () => ({
  getCampaignRouteAccess: mocks.getCampaignRouteAccess,
}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));
vi.mock("@/lib/campaign/narrative-settings", () => ({ loadCampaignNarrativeSettings: mocks.loadCampaignNarrativeSettings }));

import { getCampaignSettings } from "@/lib/campaign/settings-server";

const campaignId = "00000000-0000-4000-8000-000000000001";

describe("campaign Settings server access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseServerClient.mockResolvedValue({});
    mocks.loadCampaignNarrativeSettings.mockResolvedValue({ settings: { setting: "", styleTags: [] } });
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
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.loadCampaignNarrativeSettings).not.toHaveBeenCalled();
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
      narrativeSettings: { setting: "", styleTags: [] },
      campaign: { name: "Signal Lost", description: "A missing ship." },
    });
    expect(mocks.getCampaignRouteAccess).toHaveBeenCalledWith(campaignId);
    expect(mocks.getSupabaseServerClient).toHaveBeenCalledOnce();
    expect(mocks.loadCampaignNarrativeSettings).toHaveBeenCalledWith({}, campaignId);
  });

  it("does not silently replace private narrative settings read failures with empty values", async () => {
    mocks.getCampaignRouteAccess.mockResolvedValue({
      role: "gm",
      displayName: "Director",
      campaign: { name: "Signal Lost", description: "A missing ship." },
    });
    mocks.loadCampaignNarrativeSettings.mockResolvedValue({ error: "Campaign narrative settings could not be loaded." });

    await expect(getCampaignSettings(campaignId)).rejects.toThrow("Campaign narrative settings could not be loaded.");
  });
});