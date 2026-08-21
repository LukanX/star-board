import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { getCampaignSettings } from "@/lib/campaign/settings-server";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

describe("campaign Settings server access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without checking membership when the user is unauthenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(getCampaignSettings(campaignId)).resolves.toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("returns null when the user is not a campaign member", async () => {
    const supabase = { from: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue(null);

    await expect(getCampaignSettings(campaignId)).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns null for a campaign player even when membership exists", async () => {
    const supabase = { from: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    await expect(getCampaignSettings(campaignId)).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns the GM settings access contract for a campaign member", async () => {
    const supabase = { from: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    await expect(getCampaignSettings(campaignId)).resolves.toEqual({ role: "gm", displayName: "Director" });
    expect(mocks.getCampaignMembership).toHaveBeenCalledWith(supabase, campaignId, userId);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});