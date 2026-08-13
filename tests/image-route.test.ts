import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/ai/client", () => ({ generateImage: mocks.generateImage }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));

import { POST } from "@/app/api/ai/image/route";
import { AiProviderError } from "@/lib/ai/errors";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function createRequest(body: unknown) {
  return new Request("http://localhost/api/ai/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock() {
  const campaignQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { system: "Starfinder 2e", description: "A tense frontier campaign", art_style_suffix: "Cinematic sci-fi realism" },
      error: null,
    }),
  };
  campaignQuery.select.mockReturnValue(campaignQuery);
  campaignQuery.eq.mockReturnValue(campaignQuery);

  const generationInsert = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000003", created_at: "2026-08-03T12:34:56+00:00" },
      error: null,
    }),
  };
  generationInsert.insert.mockReturnValue(generationInsert);
  generationInsert.select.mockReturnValue(generationInsert);

  return {
    from: vi.fn()
      .mockReturnValueOnce(campaignQuery)
      .mockReturnValueOnce(generationInsert),
    generationInsert,
  };
}

describe("POST /api/ai/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed input before checking campaign access", async () => {
    const response = await POST(createRequest({}));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Image request is invalid.");
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("returns 403 when the session is not a campaign GM", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "npc",
      subject: "A masked station broker",
    }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required for AI art assistance.");
  });

  it("returns a validated draft with a canonical timestamp and audit run", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini", "google/gemini-2.5-flash", "openai/gpt-4o", "openai/gpt-image-1", "google/gemini-2.5-flash-image", "bytedance-seed/seedream-4.5"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [
      { id: "openai/gpt-image-1", capability: "image", compatible: true },
      { id: "google/gemini-2.5-flash-image", capability: "image", compatible: true },
    ] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "npc",
      subject: "A masked station broker",
      model: "openai/gpt-image-1",
      aspectRatio: "16:9",
      size: "2048x1152",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.stringContaining("masked station broker"), "openai/gpt-image-1", { aspectRatio: "16:9", size: "2048x1152" });
    expect(payload.draft).toMatchObject({
      generationRunId: "00000000-0000-4000-8000-000000000003",
      aspectRatio: "16:9",
      size: "2048x1152",
      image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" },
      createdAt: "2026-08-03T12:34:56.000Z",
    });
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      campaign_id: campaignId,
      requested_by: userId,
      kind: "image",
      status: "complete",
    }));
  });

  it("surfaces provider rate limits instead of masking them as an application failure", async () => {
    const providerLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockRejectedValue(new AiProviderError("OpenRouter image generation failed. Provider rate limit exceeded", { status: 429, requestId: "image-request-1", retryAfter: "12", providerBody: "{\"error\":\"rate limit\"}", generationId: "image-generation-1" }));

    const response = await POST(createRequest({ campaignId, mode: "refine", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(payload).toMatchObject({ error: expect.stringContaining("Provider rate limit exceeded"), providerRequestId: "image-request-1" });
    expect(payload).not.toHaveProperty("providerBody");
    expect(payload).not.toHaveProperty("generationId");
    expect(JSON.parse(providerLog.mock.calls[0][0] as string)).toMatchObject({ event: "ai_provider_failure", kind: "image", status: 429, requestId: "image-request-1", generationId: "image-generation-1", providerBody: "{\"error\":\"rate limit\"}" });
  });
});