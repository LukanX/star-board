import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  createCampaignArtSignedUrl: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));
vi.mock("@/lib/storage/campaign-art", () => ({
  createCampaignArtSignedUrl: mocks.createCampaignArtSignedUrl,
}));

import { GET } from "@/app/api/campaigns/[campaignId]/entities/preview/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const entityId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function createSupabase(table: string, query: ReturnType<typeof createQuery>) {
  const from = vi.fn((requestedTable: string) => {
    if (requestedTable !== table) throw new Error(`Unexpected table query: ${requestedTable}`);
    return query;
  });
  return { supabase: { from }, from };
}

function request(section: string, id = entityId) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/entities/preview?section=${section}&id=${id}`);
}

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

describe("campaign entity preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.createCampaignArtSignedUrl.mockResolvedValue("https://signed.example.test/portrait.png");
  });

  it("returns only the public brief and a signed image URL for a member-readable entity", async () => {
    const query = createQuery({
      id: entityId,
      name: "Mara Venn",
      species: "Human",
      role: "Relay keeper",
      description: "A weathered contact stationed at the outer relay.",
      art_path: `${campaignId}/${userId}/mara.png`,
    });
    const { supabase } = createSupabase("npcs", query);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(request("npcs"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.entity).toEqual({
      id: entityId,
      name: "Mara Venn",
      description: "A weathered contact stationed at the outer relay.",
      imageUrl: "https://signed.example.test/portrait.png",
      href: `/campaigns/${campaignId}/npcs/${entityId}`,
    });
    expect(query.select).toHaveBeenCalledWith("id, name, species, role, description, art_path");
    expect(mocks.createCampaignArtSignedUrl).toHaveBeenCalledWith(supabase, `${campaignId}/${userId}/mara.png`, 600, false);
  });

  it("returns not found when RLS hides an unrevealed enemy from a player", async () => {
    const query = createQuery(null);
    const { supabase } = createSupabase("enemies", query);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(request("enemies"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Campaign entity not found.");
    expect(mocks.createCampaignArtSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects malformed section and identifiers before querying the database", async () => {
    const query = createQuery(null);
    const { supabase, from } = createSupabase("npcs", query);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(request("members", "not-a-uuid"), routeContext());

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});