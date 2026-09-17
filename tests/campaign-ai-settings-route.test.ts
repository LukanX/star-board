import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockCampaignCredentialError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "CampaignCredentialError";
      this.code = code;
    }
  }

  return {
    getAiModelCatalog: vi.fn(),
    getLocalAiModelCatalog: vi.fn(),
    loadCampaignAiSettings: vi.fn(),
    loadCampaignVisualStyle: vi.fn(),
    requireCampaignGM: vi.fn(),
    getCampaignCredentialStatusForManager: vi.fn(),
    getCampaignCredentialForGeneration: vi.fn(),
    CampaignCredentialError: MockCampaignCredentialError,
  };
});

vi.mock("@/lib/ai/model-discovery", () => ({ aiModelSorts: ["most-popular", "pricing-low-to-high", "pricing-high-to-low"], getAiModelCatalog: mocks.getAiModelCatalog, getLocalAiModelCatalog: mocks.getLocalAiModelCatalog }));
vi.mock("@/lib/ai/campaign-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/campaign-settings")>();
  return { ...actual, loadCampaignAiSettings: mocks.loadCampaignAiSettings, loadCampaignVisualStyle: mocks.loadCampaignVisualStyle };
});
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/campaign-credentials", () => ({ CampaignCredentialError: mocks.CampaignCredentialError, getCampaignCredentialStatusForManager: mocks.getCampaignCredentialStatusForManager, getCampaignCredentialForGeneration: mocks.getCampaignCredentialForGeneration }));

import { GET, PATCH } from "@/app/api/campaigns/[campaignId]/ai-settings/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const textModel = { id: "openai/gpt-4o-mini", capability: "structured-text", available: true, compatible: true };
const imageModel = { id: "openai/gpt-image-1", capability: "image", available: true, compatible: true };
const credentialStatus = { connected: true, verificationStatus: "verified", label: "Campaign key", limitUsd: 10, remainingUsd: 9, usageUsd: 1, unlimited: false, connectedBy: "user-id", connectedByName: "Nova", connectedAt: "2026-08-10T12:00:00.000Z", lastVerifiedAt: "2026-08-10T12:00:00.000Z", verificationError: null, allowPlayerAi: false, canManage: true, canUse: true, ownerSettingsUrl: "https://openrouter.ai/keys/hash" };

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

function createSupabaseMock() {
  return { rpc: vi.fn().mockResolvedValue({ error: null }) };
}

describe("campaign AI settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCampaignGM.mockResolvedValue({ supabase: createSupabaseMock(), user: { id: "user-id" }, role: "gm" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: [textModel.id, imageModel.id] } });
    mocks.loadCampaignVisualStyle.mockResolvedValue({ visualStyle: "Cinematic frontier realism" });
    mocks.getCampaignCredentialStatusForManager.mockResolvedValue({ status: credentialStatus });
    mocks.getCampaignCredentialForGeneration.mockResolvedValue({ apiKey: "campaign-key", status: credentialStatus });
    mocks.getAiModelCatalog.mockImplementation(async (_apiKey: string, capability: "structured-text" | "image") => ({ status: "live", models: [capability === "image" ? imageModel : textModel] }));
    mocks.getLocalAiModelCatalog.mockImplementation((capability: "structured-text" | "image") => ({ status: "unavailable", models: [capability === "image" ? imageModel : textModel] }));
  });

  it("returns the persisted allowlist and enriched model catalog to a GM", async () => {
    const response = await GET(new Request("http://localhost"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.enabledModelIds).toEqual([textModel.id, imageModel.id]);
    expect(payload.visualStyle).toBe("Cinematic frontier realism");
    expect(payload.credential.connectedByName).toBe("Nova");
    expect(payload.models).toEqual(expect.arrayContaining([expect.objectContaining({ id: textModel.id, enabled: true }), expect.objectContaining({ id: imageModel.id, enabled: true })]));
  });

  it("rejects an allowlist that removes the last capability model", async () => {
    const response = await PATCH(request({ visualStyle: "Cinematic frontier realism", enabledModelIds: [textModel.id] }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Enable at least one image model.");
  });

  it("persists a valid allowlist", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "user-id" }, role: "gm" });

    const response = await PATCH(request({ visualStyle: "Cinematic frontier realism", enabledModelIds: [imageModel.id, textModel.id] }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.enabledModelIds).toEqual([textModel.id, imageModel.id]);
    expect(payload.visualStyle).toBe("Cinematic frontier realism");
    expect(supabase.rpc).toHaveBeenCalledWith("update_campaign_ai_preferences", {
      p_campaign_id: campaignId,
      p_visual_style: "Cinematic frontier realism",
      p_enabled_model_ids: [textModel.id, imageModel.id],
    });
  });

  it("returns the offline catalog without allowing model preference edits before connection", async () => {
    mocks.getCampaignCredentialStatusForManager.mockResolvedValue({ status: { ...credentialStatus, connected: false, verificationStatus: "disconnected", canManage: true, canUse: false } });
    mocks.getCampaignCredentialForGeneration.mockRejectedValue(new Error("no credential"));

    const response = await GET(new Request("http://localhost"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.credentialAvailable).toBe(false);
    expect(payload.status).toBe("unavailable");
    expect(mocks.getAiModelCatalog).not.toHaveBeenCalled();
  });

  it("requires a verified campaign credential before saving preferences", async () => {
    mocks.getCampaignCredentialForGeneration.mockRejectedValue(new mocks.CampaignCredentialError("missing", "Connect an OpenRouter key for this campaign before using AI assistance."));

    const response = await PATCH(request({ visualStyle: "Cinematic frontier realism", enabledModelIds: [textModel.id, imageModel.id] }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ code: "missing", error: "Connect an OpenRouter key for this campaign before using AI assistance." });
  });
});
