import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  requireCampaignGM: vi.fn(),
  getPublicEnv: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
  requireCampaignGM: mocks.requireCampaignGM,
}));
vi.mock("@/lib/env", () => ({ getPublicEnv: mocks.getPublicEnv }));

import { POST as redeemJoinLink } from "@/app/api/campaigns/join/route";
import { POST as createJoinLink } from "@/app/api/campaigns/[campaignId]/join-links/route";
import { GET as getMembership, PATCH as updateMembership } from "@/app/api/campaigns/[campaignId]/membership/route";
import { DELETE as removeMember, PATCH as updateMember } from "@/app/api/campaigns/[campaignId]/members/[userId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown, url = "http://localhost/api/campaigns") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ campaignId }) };
}

function memberParams(targetUserId = userId) {
  return { params: Promise.resolve({ campaignId, userId: targetUserId }) };
}

function createSupabaseMock() {
  const rpc = vi.fn();
  const joinLinkQuery = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000003", expires_at: null, max_uses: 1 },
      error: null,
    }),
  };
  joinLinkQuery.insert.mockReturnValue(joinLinkQuery);
  joinLinkQuery.select.mockReturnValue(joinLinkQuery);

  return {
    from: vi.fn().mockReturnValue(joinLinkQuery),
    rpc,
    joinLinkQuery,
  };
}

describe("membership and join-link routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://star-board.example" });
  });

  it("requires authentication to read membership", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await getMembership(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication is required.");
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("denies an authenticated user who is not a campaign member", async () => {
    const supabase = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue(null);

    const response = await getMembership(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Campaign membership is required.");
    expect(mocks.getCampaignMembership).toHaveBeenCalledWith(supabase, campaignId, userId);
  });

  it("updates a member's campaign display name through the authenticated RPC", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: "Nova", error: null });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateMembership(
      request({ displayName: " Nova " }),
      params(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.displayName).toBe("Nova");
    expect(supabase.rpc).toHaveBeenCalledWith("set_campaign_display_name", {
      target_campaign_id: campaignId,
      new_display_name: "Nova",
    });
  });

  it("requires GM access to create a join link", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await createJoinLink(
      request({ maxUses: 1, expiresAt: null }),
      params(),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required.");
  });

  it("creates a campaign-scoped join link with a hashed token", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });

    const response = await createJoinLink(
      request({ maxUses: 3, expiresAt: null }, `http://localhost/api/campaigns/${campaignId}/join-links`),
      params(),
    );
    const payload = await response.json();
    const insert = supabase.joinLinkQuery.insert.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(payload.joinUrl).toMatch(/^https:\/\/star-board\.example\/join\/[A-Za-z0-9_-]+$/);
    expect(insert).toMatchObject({
      campaign_id: campaignId,
      created_by: userId,
      expires_at: null,
      max_uses: 3,
    });
    expect(insert.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("redeems a join token through its SHA-256 hash", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: campaignId, error: null });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await redeemJoinLink(request({ token: "join-token-with-more-than-20-chars" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.campaignId).toBe(campaignId);
    expect(supabase.rpc).toHaveBeenCalledWith("redeem_campaign_join_link", {
      join_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("prevents a GM from changing their own role", async () => {
    const memberQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { user_id: userId, role: "gm", display_name: "Captain", joined_at: "2026-08-03T12:34:56.000Z" },
        error: null,
      }),
    };
    memberQuery.select.mockReturnValue(memberQuery);
    memberQuery.eq.mockReturnValue(memberQuery);
    const supabase = { from: vi.fn().mockReturnValue(memberQuery) };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });

    const response = await updateMember(
      request({ role: "player" }),
      memberParams(),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("You cannot change your own campaign role.");
    expect(supabase.from).toHaveBeenCalledWith("campaign_members");
    expect(memberQuery.maybeSingle).toHaveBeenCalled();
  });

  it("prevents a GM from removing themselves", async () => {
    const supabase = { from: vi.fn() };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });

    const response = await removeMember(new Request("http://localhost"), memberParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("You cannot remove yourself from the campaign.");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});