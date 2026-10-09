import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignNarrativeSettings, saveCampaignNarrativeSettings } from "@/lib/campaign/narrative-settings";

const campaignId = "00000000-0000-4000-8000-000000000001";

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
    upsert: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.upsert.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  return { supabase: { from }, from, query };
}

describe("campaign narrative settings storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty values for a GM-readable campaign with no saved settings row", async () => {
    const { supabase, from, query } = createSupabaseMock({ data: null, error: null });

    await expect(loadCampaignNarrativeSettings(supabase as never, campaignId)).resolves.toEqual({
      settings: { setting: "", styleTags: [] },
    });
    expect(from).toHaveBeenCalledWith("campaign_narrative_settings");
    expect(query.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });

  it("loads validated settings and canonicalizes preset labels", async () => {
    const { supabase } = createSupabaseMock({
      data: { setting: "A remote science outpost.", style_tags: ["space opera", "found family"] },
      error: null,
    });

    await expect(loadCampaignNarrativeSettings(supabase as never, campaignId)).resolves.toEqual({
      settings: { setting: "A remote science outpost.", styleTags: ["Space Opera", "found family"] },
    });
  });

  it("surfaces query and invalid stored-data errors instead of masking them as empty settings", async () => {
    const queryFailure = createSupabaseMock({ data: null, error: new Error("database details") });
    await expect(loadCampaignNarrativeSettings(queryFailure.supabase as never, campaignId)).resolves.toEqual({
      error: "Campaign narrative settings could not be loaded.",
    });

    const invalidRow = createSupabaseMock({ data: { setting: "", style_tags: ["Mystery", "mystery"] }, error: null });
    await expect(loadCampaignNarrativeSettings(invalidRow.supabase as never, campaignId)).resolves.toEqual({
      error: "Campaign narrative settings are invalid.",
    });
  });

  it("upserts both values atomically and returns canonicalized settings", async () => {
    const { supabase, query } = createSupabaseMock({
      data: { setting: "A drifting fleet.", style_tags: ["Space Opera", "Mystery"] },
      error: null,
    });

    await expect(saveCampaignNarrativeSettings(supabase as never, campaignId, {
      setting: "A drifting fleet.",
      styleTags: ["Space Opera", "Mystery"],
    })).resolves.toEqual({ settings: { setting: "A drifting fleet.", styleTags: ["Space Opera", "Mystery"] } });
    expect(query.upsert).toHaveBeenCalledWith({
      campaign_id: campaignId,
      setting: "A drifting fleet.",
      style_tags: ["Space Opera", "Mystery"],
      updated_at: expect.any(String),
    }, { onConflict: "campaign_id" });
    expect(query.select).toHaveBeenCalledWith("setting, style_tags");
  });
});