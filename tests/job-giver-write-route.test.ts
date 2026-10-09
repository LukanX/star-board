import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(), getCampaignRole: vi.fn(),
  validateCampaignEntityLinkFields: vi.fn(), validateCampaignPlace: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser, getCampaignRole: mocks.getCampaignRole,
}));
vi.mock("@/lib/campaign/note-links", () => ({
  validateCampaignEntityLinkFields: mocks.validateCampaignEntityLinkFields,
}));
vi.mock("@/lib/places", () => ({ validateCampaignPlace: mocks.validateCampaignPlace }));
vi.mock("@/lib/storage/campaign-art", () => ({
  addCampaignArtUrls: async (_client: unknown, records: unknown[]) => records,
}));

import { POST, PATCH } from "@/app/api/campaigns/[campaignId]/jobs/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const giverId = "00000000-0000-4000-8000-000000000003";

function createQuery() {
  const query = {
    insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), select: vi.fn(),
    eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), then: vi.fn(),
  };
  for (const method of [query.insert, query.update, query.upsert, query.select, query.eq]) method.mockReturnValue(query);
  query.single.mockResolvedValue({ data: { id: jobId, art_path: null }, error: null });
  query.maybeSingle.mockResolvedValue({ data: { art_path: null }, error: null });
  query.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve));
  return query;
}

describe("optional giver job writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.validateCampaignEntityLinkFields.mockResolvedValue(true);
    mocks.validateCampaignPlace.mockResolvedValue({ valid: true });
  });

  it.each([
    { giverType: null, giverId: null, expectedNpc: null, expectedFaction: null },
    { giverType: "npc", giverId, expectedNpc: giverId, expectedFaction: null },
    { giverType: "faction", giverId, expectedNpc: null, expectedFaction: giverId },
  ])("creates and updates the selected giver pair: %j", async ({ giverType, giverId: selectedId, expectedNpc, expectedFaction }) => {
    for (const method of ["POST", "PATCH"] as const) {
      const jobs = createQuery();
      const notes = createQuery();
      const supabase = { from: vi.fn((table: string) => table === "jobs" ? jobs : notes) };
      mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: giverId } });
      const request = new Request("http://localhost/api/jobs", {
        method, body: JSON.stringify({ title: "Mission", jobId, giverType, giverId: selectedId }),
      });
      const response = await (method === "POST" ? POST : PATCH)(request, { params: Promise.resolve({ campaignId }) });
      expect(response.status).toBe(method === "POST" ? 201 : 200);
      expect(method === "POST" ? jobs.insert : jobs.update).toHaveBeenCalledWith(expect.objectContaining({
        giver_npc_id: expectedNpc, giver_faction_id: expectedFaction,
      }));
      if (method === "PATCH") {
        expect(jobs.eq).toHaveBeenCalledWith("campaign_id", campaignId);
        expect(jobs.eq).toHaveBeenCalledWith("id", jobId);
      }
    }
  });

  it("rejects a partial giver pair before authentication", async () => {
    const request = new Request("http://localhost/api/jobs", { method: "POST", body: JSON.stringify({ title: "Mission", giverType: "npc" }) });
    const response = await POST(request, { params: Promise.resolve({ campaignId }) });
    expect(response.status).toBe(400);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("retains GM-only mutation authorization without a giver", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: giverId } });
    mocks.getCampaignRole.mockResolvedValue("player");
    const request = new Request("http://localhost/api/jobs", { method: "POST", body: JSON.stringify({ title: "Mission" }) });
    expect((await POST(request, { params: Promise.resolve({ campaignId }) })).status).toBe(403);
  });
});
