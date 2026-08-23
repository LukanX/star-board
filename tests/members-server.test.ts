import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { getCampaignMembers } from "@/lib/campaign/members-server";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const otherUserId = "00000000-0000-4000-8000-000000000003";

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.then.mockImplementation((onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data, error }).then(onFulfilled));

  return query;
}

describe("campaign Members server reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without querying membership when the user is unauthenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const result = await getCampaignMembers(campaignId);

    expect(result).toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("returns null without querying members when the user is not in the campaign", async () => {
    const supabase = { from: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue(null);

    const result = await getCampaignMembers(campaignId);

    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns a campaign-scoped roster with the current user identifier", async () => {
    const membersQuery = createQuery([
      { user_id: userId, role: "gm", display_name: "Director", joined_at: "2026-08-21T00:00:00.000Z" },
      { user_id: otherUserId, role: "player", display_name: "Pilot", joined_at: "2026-08-22T00:00:00.000Z" },
    ]);
    const supabase = { from: vi.fn().mockReturnValue(membersQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const result = await getCampaignMembers(campaignId);

    expect(result).toEqual({
      currentUserId: userId,
      role: "gm",
      displayName: "Director",
      members: [
        { userId, role: "gm", displayName: "Director", joinedAt: "2026-08-21T00:00:00.000Z" },
        { userId: otherUserId, role: "player", displayName: "Pilot", joinedAt: "2026-08-22T00:00:00.000Z" },
      ],
    });
    expect(membersQuery.select).toHaveBeenCalledWith("user_id, role, display_name, joined_at");
    expect(membersQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(membersQuery.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });

  it("preserves player role and display name in the routed read contract", async () => {
    const membersQuery = createQuery([{ user_id: userId, role: "player", display_name: "Pilot", joined_at: "2026-08-21T00:00:00.000Z" }]);
    const supabase = { from: vi.fn().mockReturnValue(membersQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const result = await getCampaignMembers(campaignId);

    expect(result?.role).toBe("player");
    expect(result?.displayName).toBe("Pilot");
    expect(result?.members[0]?.role).toBe("player");
  });
});