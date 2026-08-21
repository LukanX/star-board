import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

describe("getCampaignRouteAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null for an unauthenticated request", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("returns null for a non-member without reading campaign data", async () => {
    const from = vi.fn();
    const supabase = { from };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue(null);
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns normalized access for a member with a campaign", async () => {
    const campaign = { id: "campaign-1", name: "Starfall", system: "scifi", description: "Brief", created_by: "gm-1" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: campaign, error: null });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toEqual({ campaign, role: "player", displayName: "Nova" });
    expect(select).toHaveBeenCalledWith("id, name, system, description, created_by");
  });

  it("rejects with a descriptive error when the campaign query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "database offline" } });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).rejects.toThrow("Unable to read campaign route: database offline");
  });

  it("returns null when the campaign is missing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toBeNull();
  });
});
