import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiModelCatalog: vi.fn(),
  getAiImagePricing: vi.fn(),
  requireCampaignGM: vi.fn(),
  resolveCampaignCredential: vi.fn(),
}));

vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/image-pricing", () => ({ getAiImagePricing: mocks.getAiImagePricing }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/route-support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/route-support")>();
  return { ...actual, resolveCampaignCredential: mocks.resolveCampaignCredential };
});

import { GET } from "@/app/api/ai/models/pricing/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const modelId = "bytedance-seed/seedream-5-0-pro";

describe("GET /api/ai/models/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: "gm-id" }, role: "gm" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key" });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: modelId, capability: "image", compatible: true }] });
    mocks.getAiImagePricing.mockResolvedValue({ status: "live", prices: [{ providerName: "Seed", providerSlug: "seed", billable: "output_image", unit: "image", costUsd: 0.045, variant: "1k" }] });
  });

  it("requires a campaign and safe model ID", async () => {
    expect((await GET(new Request("http://localhost/api/ai/models/pricing"))).status).toBe(400);
    const unsafe = await GET(new Request(`http://localhost/api/ai/models/pricing?campaignId=${campaignId}&modelId=https%3A%2F%2Fattacker.test%2Fimage`));
    expect(unsafe.status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("keeps image pricing GM-only", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await GET(new Request(`http://localhost/api/ai/models/pricing?campaignId=${campaignId}&modelId=${encodeURIComponent(modelId)}`));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required to view image pricing.");
    expect(mocks.resolveCampaignCredential).not.toHaveBeenCalled();
  });

  it("returns cached endpoint prices only for image models in the campaign catalog", async () => {
    const response = await GET(new Request(`http://localhost/api/ai/models/pricing?campaignId=${campaignId}&modelId=${encodeURIComponent(modelId)}`));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ modelId, status: "live", prices: [{ providerName: "Seed", costUsd: 0.045, unit: "image", variant: "1k" }] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getAiModelCatalog).toHaveBeenCalledWith("campaign-key", "image");
    expect(mocks.getAiImagePricing).toHaveBeenCalledWith("campaign-key", modelId);
  });

  it("rejects models outside the campaign image catalog", async () => {
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [] });

    const response = await GET(new Request(`http://localhost/api/ai/models/pricing?campaignId=${campaignId}&modelId=${encodeURIComponent(modelId)}`));

    expect(response.status).toBe(404);
    expect(mocks.getAiImagePricing).not.toHaveBeenCalled();
  });
});