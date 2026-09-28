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

  const styleQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { visual_style: "Custom campaign image style", status: "ready" },
      error: null,
    }),
  };
  styleQuery.select.mockReturnValue(styleQuery);
  styleQuery.eq.mockReturnValue(styleQuery);

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
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.example/image.png" }, error: null });
  const storageFrom = vi.fn().mockReturnValue({ upload, remove, createSignedUrl });
  const attachImage = vi.fn().mockResolvedValue({ data: true, error: null });

  let generationRunQueryCount = 0;
  const from = vi.fn((table: string) => {
    if (table === "campaigns") return campaignQuery;
    if (table === "campaign_visual_styles") return styleQuery;
    if (table === "ai_generation_runs") {
      generationRunQueryCount += 1;
      return generationRunQueryCount === 1 ? generationInsert : generationUpdate;
    }
    return generationUpdate;
  });

  return {
    from,
    storage: { from: storageFrom },
    rpc: attachImage,
    generationInsert,
    generationUpdate,
    styleQuery,
    upload,
    remove,
    attachImage,
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

  it("labels unexpected campaign credential failures without exposing their message", async () => {
    const diagnosticLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: userId }, role: "gm" });
    mocks.resolveCampaignCredential.mockRejectedValue(new Error("internal credential backend detail"));

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "npc",
      subject: "A station broker",
      model: "x-ai/grok-imagine-image-2.0",
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: "Art generation is temporarily unavailable.", diagnosticStage: "campaign-credential" });
    expect(JSON.stringify(payload)).not.toContain("internal credential backend detail");
    expect(JSON.parse(diagnosticLog.mock.calls[0][0] as string)).toEqual({
      event: "ai_image_unexpected_failure",
      stage: "campaign-credential",
      model: "x-ai/grok-imagine-image-2.0",
      errorName: "Error",
    });
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
      currentPrompt: "OLD-COMPOSED-PROMPT",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toMatchObject({ targetKind: "character", characterId: savedCharacterAccess.access.character.id });
    expect(payload.draft).toMatchObject({
      temporaryPath: `${campaignId}/${userId}/image-00000000-0000-4000-8000-000000000003.png`,
      image: { base64: null, url: "https://storage.example/image.png", mediaType: "image/png" },
    });
    expect(mocks.generateImage.mock.calls[0][1]).toContain("Saved character: Nova Vex, Android.");
    expect(mocks.generateImage.mock.calls[0][1]).not.toContain("A tense frontier campaign");
    expect(mocks.generateImage.mock.calls[0][1]).not.toContain("A survivor of the derelict ship Meridian.");
    expect(mocks.generateImage.mock.calls[0][1]).toContain("blue circuit scar");
    expect(mocks.generateImage.mock.calls[0][1]).toContain("Campaign visual style: Cinematic sci-fi realism");
    expect(mocks.generateImage.mock.calls[0][1]).not.toContain("OLD-COMPOSED-PROMPT");
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ target_character_id: savedCharacterAccess.access.character.id }));
    expect(supabase.attachImage).toHaveBeenCalledWith("attach_ai_generation_image", {
      p_generation_run_id: "00000000-0000-4000-8000-000000000003",
      p_image_path: `${campaignId}/${userId}/image-00000000-0000-4000-8000-000000000003.png`,
      p_image_media_type: "image/png",
    });
  });

  it("uses a GM-selected saved visual style for a character portrait", async () => {
    const supabase = createSupabaseMock();
    const visualStyleId = "00000000-0000-4000-8000-000000000005";
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue({
      access: { ...savedCharacterAccess.access, role: "gm" as const },
    });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "character",
      characterId: savedCharacterAccess.access.character.id,
      visualStyleId,
      subject: "A calm three-quarter portrait.",
    }));

    expect(response.status).toBe(200);
    expect(mocks.generateImage.mock.calls[0][1]).toContain("Campaign visual style: Custom campaign image style");
    expect(mocks.generateImage.mock.calls[0][1]).not.toContain("Cinematic sci-fi realism");
    expect(supabase.styleQuery.eq).toHaveBeenCalledWith("id", visualStyleId);
    expect(supabase.styleQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
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
      { id: "openai/gpt-image-1", capability: "image", compatible: true, supportedParameters: ["aspect_ratio"], parameterValues: { aspect_ratio: ["1:1", "3:4", "4:3", "16:9"] } },
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
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", expect.stringContaining("The Glass Meridian"), "openai/gpt-image-1", { aspectRatio: "16:9", supportedParameters: ["aspect_ratio"] });
    expect(mocks.generateImage.mock.calls[0][1]).toContain("only one standalone faction symbol or in-world insignia");
    expect(payload.draft).toMatchObject({
      generationRunId: "00000000-0000-4000-8000-000000000003",
      aspectRatio: "16:9",
      temporaryPath: `${campaignId}/${userId}/image-00000000-0000-4000-8000-000000000003.png`,
      image: { base64: null, url: "https://storage.example/image.png", mediaType: "image/png" },
      createdAt: "2026-08-03T12:34:56.000Z",
    });
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      campaign_id: campaignId,
      requested_by: userId,
      kind: "image",
      status: "complete",
    }));
  });

  it("uses the Grok image model's advertised resolution and aspect-ratio parameters", async () => {
    const supabase = createSupabaseMock();
    const model = "x-ai/grok-imagine-image-2.0";
    const supportedParameters = ["aspect_ratio", "resolution"];
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: model });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: [model] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{
      id: model,
      capability: "image",
      compatible: true,
      supportedParameters,
      parameterValues: { aspect_ratio: ["1:1", "16:9"], resolution: ["1K", "2K"] },
    }] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "npc",
      subject: "A masked station broker",
      aspectRatio: "16:9",
      model,
    }));

    expect(response.status).toBe(200);
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", expect.any(String), model, {
      aspectRatio: "16:9",
      resolution: "1K",
      supportedParameters,
    });
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ size: null }));
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

  it("removes a temporary image when its generation metadata cannot be attached", async () => {
    const supabase = createSupabaseMock();
    supabase.attachImage.mockResolvedValue({ data: false, error: null });
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "npc",
      subject: "A masked station broker",
      model: "openai/gpt-image-1",
    }));

    expect(response.status).toBe(503);
    expect(supabase.remove).toHaveBeenCalledWith([`${campaignId}/${userId}/image-00000000-0000-4000-8000-000000000003.png`]);
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

  it("reports a socket close without an upstream HTTP response as a bad gateway", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "x-ai/grok-imagine-image-2.0" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["x-ai/grok-imagine-image-2.0"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{
      id: "x-ai/grok-imagine-image-2.0",
      capability: "image",
      compatible: true,
      supportedParameters: ["aspect_ratio", "resolution"],
      parameterValues: { aspect_ratio: ["1:1"], resolution: ["1K", "2K"] },
    }] });
    mocks.generateImage.mockRejectedValue(new AiProviderError("OpenRouter image generation request failed. fetch failed (UND_ERR_SOCKET)", {
      status: null,
      outcomeUnknown: true,
      providerBody: "{\"errorName\":\"TypeError\",\"causes\":[{\"name\":\"SocketError\",\"code\":\"UND_ERR_SOCKET\"}]}",
    }));

    const response = await POST(createRequest({
      campaignId,
      mode: "create",
      targetKind: "npc",
      subject: "A station broker",
      model: "x-ai/grok-imagine-image-2.0",
    }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      error: expect.stringContaining("UND_ERR_SOCKET"),
      diagnosticStage: "provider-generation",
      outcomeUnknown: true,
    });
    expect(payload).not.toHaveProperty("providerBody");
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      error_message: expect.stringContaining("may have been billed"),
    }));
  });

  it("preserves a Seedream provider 503 and request ID without switching models", async () => {
    const providerLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseMock();
    const model = "bytedance-seed/seedream-5-0-pro";
    const supportedParameters = ["aspect_ratio", "resolution"];
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: model });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: [model, "openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{
      id: model,
      capability: "image",
      compatible: true,
      supportedParameters,
      parameterValues: { aspect_ratio: ["1:1", "16:9"], resolution: ["1K", "2K"] },
    }] });
    mocks.generateImage.mockRejectedValue(new AiProviderError("OpenRouter image generation failed. Seedream is temporarily unavailable", {
      status: 503,
      requestId: "seedream-request-503",
      retryAfter: "30",
      providerBody: "{\"error\":\"provider unavailable\"}",
    }));

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "A masked station broker", model }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(payload).toMatchObject({ error: expect.stringContaining("Seedream is temporarily unavailable"), providerRequestId: "seedream-request-503", diagnosticStage: "provider-generation" });
    expect(payload).not.toHaveProperty("providerBody");
    expect(payload).not.toHaveProperty("outcomeUnknown");
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", expect.any(String), model, {
      aspectRatio: "1:1",
      resolution: "1K",
      supportedParameters,
    });
    expect(JSON.parse(providerLog.mock.calls[0][0] as string)).toMatchObject({ event: "ai_provider_failure", status: 503, requestId: "seedream-request-503", model });
  });

  it("returns a safe stage for unexpected failures without exposing the exception", async () => {
    const diagnosticLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "x-ai/grok-imagine-image-2.0" });
    mocks.getAiModelCatalog.mockRejectedValue(new Error("internal catalog detail with secret-shaped value"));

    const response = await POST(createRequest({ campaignId, mode: "create", targetKind: "npc", subject: "Do not log this prompt" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: "Art generation is temporarily unavailable.", diagnosticStage: "image-model-catalog" });
    expect(JSON.stringify(payload)).not.toContain("internal catalog detail");
    expect(JSON.parse(diagnosticLog.mock.calls[0][0] as string)).toEqual({
      event: "ai_image_unexpected_failure",
      stage: "image-model-catalog",
      model: null,
      errorName: "Error",
    });
    expect(JSON.stringify(diagnosticLog.mock.calls[0][0])).not.toContain("Do not log this prompt");
  });
});