import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiModelCatalog: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiSettings: vi.fn(),
}));

vi.mock("@/lib/ai/model-discovery", () => ({ aiModelSorts: ["most-popular", "pricing-low-to-high", "pricing-high-to-low"], getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));

import { GET } from "@/app/api/ai/models/route";

const campaignId = "00000000-0000-4000-8000-000000000001";

describe("GET /api/ai/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", available: true, compatible: true }] });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: "user-id" }, role: "gm" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini"] } });
  });

  it("requires a campaign, capability, and GM access", async () => {
    expect((await GET(new Request("http://localhost/api/ai/models"))).status).toBe(400);

    mocks.requireCampaignGM.mockResolvedValue(null);
    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=structured-text`));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required to view AI models.");
  });

  it("returns only the requested curated capability and configured default", async () => {
    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=structured-text`));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ capability: "structured-text", defaultModel: "openai/gpt-4o-mini", status: "live" });
    expect(mocks.getAiModelCatalog).toHaveBeenCalledWith("structured-text", "most-popular");
  });
});