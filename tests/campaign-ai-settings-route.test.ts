import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiModelCatalog: vi.fn(),
  loadCampaignAiSettings: vi.fn(),
  requireCampaignGM: vi.fn(),
}));

vi.mock("@/lib/ai/model-discovery", () => ({ aiModelSorts: ["most-popular", "pricing-low-to-high", "pricing-high-to-low"], getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/campaign-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/campaign-settings")>();
  return { ...actual, loadCampaignAiSettings: mocks.loadCampaignAiSettings };
});
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));

import { GET, PATCH } from "@/app/api/campaigns/[campaignId]/ai-settings/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const textModel = { id: "openai/gpt-4o-mini", capability: "structured-text", available: true, compatible: true };
const imageModel = { id: "openai/gpt-image-1", capability: "image", available: true, compatible: true };

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/ai-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("campaign AI settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: "user-id" }, role: "gm" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: [textModel.id, imageModel.id] } });
    mocks.getAiModelCatalog.mockImplementation(async (capability: "structured-text" | "image") => ({ status: "live", models: [capability === "image" ? imageModel : textModel] }));
  });

  it("returns the persisted allowlist and enriched model catalog to a GM", async () => {
    const response = await GET(new Request("http://localhost"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.enabledModelIds).toEqual([textModel.id, imageModel.id]);
    expect(payload.models).toEqual(expect.arrayContaining([expect.objectContaining({ id: textModel.id, enabled: true }), expect.objectContaining({ id: imageModel.id, enabled: true })]));
  });

  it("rejects an allowlist that removes the last capability model", async () => {
    const response = await PATCH(request({ enabledModelIds: [textModel.id] }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Enable at least one image model.");
  });

  it("persists a valid allowlist", async () => {
    const single = vi.fn().mockResolvedValue({ data: { enabled_model_ids: [textModel.id, imageModel.id], updated_at: "2026-08-10T12:00:00.000Z" }, error: null });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const supabase = { from: vi.fn(() => ({ upsert })) };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "user-id" }, role: "gm" });

    const response = await PATCH(request({ enabledModelIds: [imageModel.id, textModel.id] }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.enabledModelIds).toEqual([textModel.id, imageModel.id]);
    expect(upsert).toHaveBeenCalledWith({ campaign_id: campaignId, enabled_model_ids: [textModel.id, imageModel.id], updated_at: expect.any(String) }, { onConflict: "campaign_id" });
  });
});
