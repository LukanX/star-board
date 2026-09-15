import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCampaignGM: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));

import { PATCH } from "@/app/api/campaigns/[campaignId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);

  const update = vi.fn().mockReturnValue(query);
  return {
    supabase: { from: vi.fn().mockReturnValue({ update }) },
    query,
    update,
  };
}

describe("campaign detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed JSON", async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/campaigns/${campaignId}`, { method: "PATCH", body: "{" }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON." });
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("rejects invalid or unsupported campaign fields", async () => {
    const response = await PATCH(request({ name: "   ", description: "", system: "Other" }), routeContext());

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Campaign details are invalid.");
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("requires campaign GM access", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await PATCH(request({ name: "Signal Lost", description: "A missing ship." }), routeContext());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Campaign GM access is required to update campaign details." });
  });

  it("updates only the addressed campaign and returns normalized details", async () => {
    const result = { data: { id: campaignId, name: "Signal Lost", description: "A missing ship." }, error: null };
    const { supabase, query, update } = createSupabaseMock(result);
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "gm-id" }, role: "gm" });

    const response = await PATCH(request({ name: "  Signal Lost  ", description: "  A missing ship.  " }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ campaign: result.data });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "Signal Lost", description: "A missing ship.", updated_at: expect.any(String) }));
    expect(query.eq).toHaveBeenCalledWith("id", campaignId);
    expect(query.select).toHaveBeenCalledWith("id, name, description");
  });

  it("hides database failures behind the route error contract", async () => {
    const { supabase } = createSupabaseMock({ data: null, error: new Error("database details") });
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "gm-id" }, role: "gm" });

    const response = await PATCH(request({ name: "Signal Lost", description: "A missing ship." }), routeContext());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Campaign details could not be saved." });
  });
});