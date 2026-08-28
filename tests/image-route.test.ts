import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
  dispatchImageBackgroundJob: vi.fn(),
  loadPlaceAiContext: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/ai/client", () => ({ generateImage: mocks.generateImage }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/image-jobs", () => ({ dispatchImageBackgroundJob: mocks.dispatchImageBackgroundJob }));
vi.mock("@/lib/ai/assistance", () => ({ loadPlaceAiContext: mocks.loadPlaceAiContext }));

import { POST } from "@/app/api/ai/image/route";
import { AiProviderError } from "@/lib/ai/errors";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const parentId = "00000000-0000-4000-8000-000000000003";

const placeContext = {
  hierarchy: [
    { name: "Asterion", kind: "planet" },
    { name: "Night Market", kind: "district" },
  ],
  parent: {
    name: "Night Market",
    kind: "district",
    description: "A crowded district beneath the orbital ring.",
    playerNotes: "Public parent notes.",
  },
};

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
  const generationUpdate = {
    update: vi.fn(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  generationUpdate.update.mockReturnValue(generationUpdate);

  return {
    from: vi.fn()
      .mockReturnValueOnce(campaignQuery)
      .mockReturnValueOnce(generationInsert)
      .mockReturnValue(generationUpdate),
    generationInsert,
    generationUpdate,
  };
}

describe("POST /api/ai/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPlaceAiContext.mockResolvedValue({ context: undefined });
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
      targetKind: "faction",
      subject: "The Glass Meridian",
      model: "openai/gpt-image-1",
      aspectRatio: "16:9",
      size: "3840x2160",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
  expect(mocks.generateImage).toHaveBeenCalledWith(expect.stringContaining("The Glass Meridian"), "openai/gpt-image-1", { aspectRatio: "16:9", size: "3840x2160" });
  expect(mocks.generateImage.mock.calls[0][0]).toContain("only one standalone faction symbol or logo");
    expect(payload.draft).toMatchObject({
      generationRunId: "00000000-0000-4000-8000-000000000003",
      aspectRatio: "16:9",
      size: "3840x2160",
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

  it("uses the campaign-scoped parent context for synchronous Place artwork", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.loadPlaceAiContext.mockResolvedValue({ context: placeContext });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "place",
      parentPlaceId: parentId,
      subject: "A hidden transit room",
      model: "openai/gpt-image-1",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toBeDefined();
    expect(mocks.loadPlaceAiContext).toHaveBeenCalledWith(supabase, campaignId, parentId);
    expect(mocks.generateImage.mock.calls[0][0]).toContain("Immediate parent description: A crowded district beneath the orbital ring.");
    expect(mocks.generateImage.mock.calls[0][0]).toContain("keep the child place as the focal subject");
  });

  it("queues image generation for the Netlify background worker", async () => {
    const previousSiteUrl = process.env.URL;
    process.env.URL = "https://star-board.netlify.app";

    try {
      const supabase = createSupabaseMock();
      mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
      mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
      mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
      mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });

      const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload.job).toMatchObject({ generationRunId: "00000000-0000-4000-8000-000000000003", status: "pending", targetKind: "npc", mode: "create", subject: "A masked station broker" });
      expect(payload.prompt).toEqual(expect.any(String));
      expect(mocks.generateImage).not.toHaveBeenCalled();
      expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith("https://star-board.netlify.app", expect.objectContaining({ generationRunId: payload.job.generationRunId, model: "openai/gpt-image-1" }), "worker-secret");
      expect(payload.job.statusUpdatedAt).toBe("2026-08-03T12:34:56.000Z");
    } finally {
      if (previousSiteUrl === undefined) delete process.env.URL;
      else process.env.URL = previousSiteUrl;
    }
  });

  it("uses the same parent context when queuing Place artwork", async () => {
    const previousSiteUrl = process.env.URL;
    process.env.URL = "https://star-board.netlify.app";

    try {
      const supabase = createSupabaseMock();
      mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
      mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
      mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
      mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
      mocks.loadPlaceAiContext.mockResolvedValue({ context: placeContext });

      const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "place", parentPlaceId: parentId, subject: "A hidden transit room", model: "openai/gpt-image-1" }));
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(mocks.loadPlaceAiContext).toHaveBeenCalledWith(supabase, campaignId, parentId);
      expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith("https://star-board.netlify.app", expect.objectContaining({
        generationRunId: payload.job.generationRunId,
        prompt: expect.stringContaining("Immediate parent player notes: Public parent notes."),
      }), "worker-secret");
    } finally {
      if (previousSiteUrl === undefined) delete process.env.URL;
      else process.env.URL = previousSiteUrl;
    }
  });

  it("rejects an invalid Place parent before image generation", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.loadPlaceAiContext.mockResolvedValue({ error: "Place parent must belong to this campaign.", invalid: true });

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "place", parentPlaceId: parentId, subject: "A hidden transit room", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Place parent must belong to this campaign.");
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.dispatchImageBackgroundJob).not.toHaveBeenCalled();
  });

  it("returns unavailable when Place context cannot be loaded", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.loadPlaceAiContext.mockResolvedValue({ error: "Place hierarchy could not be loaded.", unavailable: true });

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "place", parentPlaceId: parentId, subject: "A hidden transit room", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Place hierarchy could not be loaded.");
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.dispatchImageBackgroundJob).not.toHaveBeenCalled();
  });

  it("queues on Netlify even when a stale sync mode is configured", async () => {
    const previousNetlifyFlag = process.env.NETLIFY;
    process.env.NETLIFY = "true";

    try {
      const supabase = createSupabaseMock();
      mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
      mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "sync" });
      mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
      mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });

      const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));

      expect(response.status).toBe(202);
      expect(mocks.generateImage).not.toHaveBeenCalled();
      expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalled();
    } finally {
      if (previousNetlifyFlag === undefined) delete process.env.NETLIFY;
      else process.env.NETLIFY = previousNetlifyFlag;
    }
  });

  it("closes the queued run when the background worker cannot be reached", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.dispatchImageBackgroundJob.mockRejectedValueOnce(new Error("worker unavailable"));

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toContain("could not be started");
    expect(supabase.generationUpdate.update).toHaveBeenCalledWith({
      status: "failed",
      status_updated_at: expect.any(String),
      error_message: "The image background worker could not be reached.",
    });
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

  it("surfaces provider timeouts with a retryable response", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockRejectedValue(new AiProviderError("OpenRouter image generation timed out. Try again, or use background generation for long-running requests.", { status: 504 }));

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload.error).toContain("timed out");
  });
});