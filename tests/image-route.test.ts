import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  loadCharacterPortraitAccess: vi.fn(),
  canUseCharacterPortraitAi: vi.fn((access: { role: string; isOwner: boolean }, allowPlayerAi: boolean) => access.role === "gm" || (access.isOwner && allowPlayerAi)),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
  resolveCampaignCredential: vi.fn(),
  dispatchImageBackgroundJob: vi.fn(),
  markImageBackgroundDispatchFailed: vi.fn(),
  loadPlaceAiContext: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM, getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/ai/character-portrait-access", () => ({ loadCharacterPortraitAccess: mocks.loadCharacterPortraitAccess, canUseCharacterPortraitAi: mocks.canUseCharacterPortraitAi }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/ai/client", () => ({ generateImage: mocks.generateImage }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/route-support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/route-support")>();
  return { ...actual, resolveCampaignCredential: mocks.resolveCampaignCredential };
});
vi.mock("@/lib/ai/image-jobs", () => ({ dispatchImageBackgroundJob: mocks.dispatchImageBackgroundJob, markImageBackgroundDispatchFailed: mocks.markImageBackgroundDispatchFailed }));
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

function createRequest(body: unknown, url = "http://localhost/api/ai/image") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const previewImageUrl = "https://deploy-preview-10--starboardsf2e.netlify.app/api/ai/image";

const savedCharacterAccess = {
  access: {
    character: {
      id: "00000000-0000-4000-8000-000000000004",
      campaign_id: campaignId,
      owner_id: userId,
      name: "Nova Vex",
      species: "Android",
      class_name: "Mechanic",
      level: 3,
      backstory_markdown: "A survivor of the derelict ship Meridian.",
      physical_description: "Tall, silver-eyed, and marked by a blue circuit scar.",
    },
    role: "player" as const,
    isOwner: true,
  },
};

function createSupabaseMock() {
  const campaignQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { system: "Starfinder 2e", description: "A tense frontier campaign", visual_style: "Cinematic sci-fi realism" },
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
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: true } });
    mocks.markImageBackgroundDispatchFailed.mockResolvedValue(undefined);
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

  it("allows an owner to generate a portrait with saved character context", async () => {
    const supabase = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue(savedCharacterAccess);
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "character",
      characterId: savedCharacterAccess.access.character.id,
      subject: "A calm three-quarter portrait with a bright workshop glow.",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toMatchObject({ targetKind: "character", characterId: savedCharacterAccess.access.character.id });
    expect(mocks.generateImage.mock.calls[0][1]).toContain("Saved character: Nova Vex, Android, Mechanic, level 3.");
    expect(mocks.generateImage.mock.calls[0][1]).toContain("blue circuit scar");
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ target_character_id: savedCharacterAccess.access.character.id }));
  });

  it("rejects a player portrait when Player AI is disabled", async () => {
    const supabase = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue(savedCharacterAccess);
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: false } });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "character",
      characterId: savedCharacterAccess.access.character.id,
      subject: "A portrait direction.",
    }));

    expect(response.status).toBe(403);
    expect(mocks.getAiModelCatalog).not.toHaveBeenCalled();
  });

  it("rejects player model and style overrides", async () => {
    const supabase = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue(savedCharacterAccess);

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "character",
      characterId: savedCharacterAccess.access.character.id,
      model: "openai/gpt-image-1",
      subject: "A portrait direction.",
    }));

    expect(response.status).toBe(403);
    expect(mocks.resolveCampaignCredential).not.toHaveBeenCalled();
  });

  it("rejects a foreign saved character before resolving campaign AI", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue({ failure: "forbidden" });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "character",
      characterId: "00000000-0000-4000-8000-000000000004",
      subject: "A portrait direction.",
    }));

    expect(response.status).toBe(403);
    expect(mocks.resolveCampaignCredential).not.toHaveBeenCalled();
  });

  it("returns a validated draft with a canonical timestamp and audit run", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
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
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", expect.stringContaining("The Glass Meridian"), "openai/gpt-image-1", { aspectRatio: "16:9", size: "3840x2160" });
    expect(mocks.generateImage.mock.calls[0][1]).toContain("only one standalone faction symbol or in-world insignia");
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
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
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
    expect(mocks.generateImage.mock.calls[0][1]).toContain("Immediate parent description: A crowded district beneath the orbital ring.");
    expect(mocks.generateImage.mock.calls[0][1]).toContain("keep the child place as the focal subject");
  });

  it("queues image generation for the Netlify background worker", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }, previewImageUrl));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job).toMatchObject({ generationRunId: "00000000-0000-4000-8000-000000000003", status: "pending", targetKind: "npc", mode: "create", subject: "A masked station broker" });
    expect(payload.prompt).toEqual(expect.any(String));
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith(previewImageUrl, expect.objectContaining({ generationRunId: payload.job.generationRunId, model: "openai/gpt-image-1" }), "worker-secret");
    expect(payload.job.statusUpdatedAt).toBe("2026-08-03T12:34:56.000Z");
  });

  it("queues a character portrait with the stored target identity", async () => {
    const supabase = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue(savedCharacterAccess);
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "character",
      characterId: savedCharacterAccess.access.character.id,
      subject: "A portrait direction.",
    }, previewImageUrl));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job).toMatchObject({ targetKind: "character", characterId: savedCharacterAccess.access.character.id });
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ target_character_id: savedCharacterAccess.access.character.id }));
  });

  it("uses the same parent context when queuing Place artwork", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.loadPlaceAiContext.mockResolvedValue({ context: placeContext });

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "place", parentPlaceId: parentId, subject: "A hidden transit room", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(mocks.loadPlaceAiContext).toHaveBeenCalledWith(supabase, campaignId, parentId);
    expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith("http://localhost/api/ai/image", expect.objectContaining({
      generationRunId: payload.job.generationRunId,
      prompt: expect.stringContaining("Immediate parent player notes: Public parent notes."),
    }), "worker-secret");
  });

  it("rejects an invalid Place parent before image generation", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
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
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
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
    delete process.env.NETLIFY;

    try {
      const supabase = createSupabaseMock();
      mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
      mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "sync" });
      mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
      mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });

      const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }, previewImageUrl));

      expect(response.status).toBe(202);
      expect(mocks.generateImage).not.toHaveBeenCalled();
      expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith(previewImageUrl, expect.anything(), "worker-secret");
    } finally {
      if (previousNetlifyFlag === undefined) delete process.env.NETLIFY;
      else process.env.NETLIFY = previousNetlifyFlag;
    }
  });

  it("closes the queued run when the background worker cannot be reached", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.dispatchImageBackgroundJob.mockRejectedValueOnce(new Error("worker unavailable"));

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toContain("could not be started");
    expect(mocks.markImageBackgroundDispatchFailed).toHaveBeenCalledWith({
      campaignId,
      generationRunId: expect.any(String),
      requestedBy: userId,
      targetCharacterId: null,
    });
  });

  it("surfaces provider rate limits instead of masking them as an application failure", async () => {
    const providerLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
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
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockRejectedValue(new AiProviderError("OpenRouter image generation timed out. Try again, or use background generation for long-running requests.", { status: 504 }));

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model: "openai/gpt-image-1" }));
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload.error).toContain("timed out");
  });
});