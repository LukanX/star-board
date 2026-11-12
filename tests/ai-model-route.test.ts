import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiModelCatalog: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  loadCampaignAiSettings: vi.fn(),
  resolveCampaignCredential: vi.fn(),
}));

vi.mock("@/lib/ai/model-discovery", () => ({ aiModelSorts: ["most-popular", "pricing-low-to-high", "pricing-high-to-low"], getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser, getCampaignMembership: mocks.getCampaignMembership, requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/route-support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/route-support")>();
  return { ...actual, resolveCampaignCredential: mocks.resolveCampaignCredential };
});

import { GET } from "@/app/api/ai/models/route";

const campaignId = "00000000-0000-4000-8000-000000000001";

describe("GET /api/ai/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", available: true, compatible: true }] });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: "user-id" }, role: "gm" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key" });
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
    expect(mocks.getAiModelCatalog).toHaveBeenCalledWith("campaign-key", "structured-text", "most-popular");
  });

  it("allows an opted-in player to view the structured-text catalog", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "player-id" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: true } });

    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=structured-text`));

    expect(response.status).toBe(200);
    expect(mocks.getCampaignMembership).toHaveBeenCalledWith({}, campaignId, "player-id");
  });

  it("keeps image model discovery GM-only for players", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "player-id" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });

    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=image`));

    expect(response.status).toBe(403);
    expect(mocks.resolveCampaignCredential).not.toHaveBeenCalled();
  });
  it("exposes only the enabled default image model capabilities to opted-in players", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "player-id" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: true } });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1", "other/image"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [
      { id: "openai/gpt-image-1", capability: "image", compatible: true, supportedParameters: ["resolution"], parameterValues: { resolution: ["1K", "2K"] } },
      { id: "other/image", capability: "image", compatible: true },
    ] });
    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=image&defaultOnly=true`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.defaultModel).toBe("openai/gpt-image-1");
    expect(payload.models.map((model: { id: string }) => model.id)).toEqual(["openai/gpt-image-1"]);
    expect(payload.models[0].parameterValues.resolution).toEqual(["1K", "2K"]);
  });
  it("uses the generation fallback order for default-only image capabilities", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "disabled/image" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["test/second", "test/first"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [
      { id: "test/first", capability: "image", compatible: true },
      { id: "test/second", capability: "image", compatible: true },
    ] });
    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=image&defaultOnly=true`));
    expect((await response.json()).defaultModel).toBe("test/first");
  });

  it("rejects a player when campaign AI opt-in is disabled", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "player-id" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: false } });

    const response = await GET(new Request(`http://localhost/api/ai/models?campaignId=${campaignId}&capability=structured-text`));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Player AI assistance is not enabled for this campaign.");
  });
});