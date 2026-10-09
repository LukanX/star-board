import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCampaignGM: vi.fn(),
  saveCampaignNarrativeSettings: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/campaign/narrative-settings", () => ({ saveCampaignNarrativeSettings: mocks.saveCampaignNarrativeSettings }));

import { PATCH } from "@/app/api/campaigns/[campaignId]/narrative-settings/route";

const campaignId = "00000000-0000-4000-8000-000000000001";

function request(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/narrative-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

describe("campaign narrative settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed JSON and invalid tag values", async () => {
    const malformed = new Request(`http://localhost/api/campaigns/${campaignId}/narrative-settings`, {
      method: "PATCH",
      body: "{",
    });
    const malformedResponse = await PATCH(malformed, routeContext());
    expect(malformedResponse.status).toBe(400);

    const invalidResponse = await PATCH(request({ setting: "", styleTags: ["Mystery", "mystery"] }), routeContext());
    expect(invalidResponse.status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("requires GM access", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await PATCH(request({ setting: "", styleTags: [] }), routeContext());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Campaign GM access is required to update narrative settings." });
    expect(mocks.saveCampaignNarrativeSettings).not.toHaveBeenCalled();
  });

  it("saves the normalized setting and tags for the addressed campaign", async () => {
    const supabase = {};
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "gm-id" }, role: "gm" });
    mocks.saveCampaignNarrativeSettings.mockResolvedValue({
      settings: { setting: "A deep-space refuge.", styleTags: ["Space Opera", "Mystery"] },
    });

    const response = await PATCH(request({
      setting: " A deep-space refuge. ",
      styleTags: ["space opera", " Mystery "],
    }), routeContext());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      narrativeSettings: { setting: "A deep-space refuge.", styleTags: ["Space Opera", "Mystery"] },
    });
    expect(mocks.saveCampaignNarrativeSettings).toHaveBeenCalledWith(supabase, campaignId, {
      setting: "A deep-space refuge.",
      styleTags: ["Space Opera", "Mystery"],
    });
  });

  it("does not expose storage details when saving fails", async () => {
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: "gm-id" }, role: "gm" });
    mocks.saveCampaignNarrativeSettings.mockResolvedValue({ error: "Campaign narrative settings could not be saved." });

    const response = await PATCH(request({ setting: "", styleTags: [] }), routeContext());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Campaign narrative settings could not be saved." });
  });
});