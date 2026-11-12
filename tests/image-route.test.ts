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
  resolveEditSource: vi.fn(),
  loadEditSourceImage: vi.fn(),
  resolveReferenceProviders: vi.fn(),
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
vi.mock("@/lib/ai/image-edit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/image-edit")>();
  return { ...actual, resolveEditSource: mocks.resolveEditSource, loadEditSourceImage: mocks.loadEditSourceImage };
});
vi.mock("@/lib/ai/studio-references", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/studio-references")>();
  return { ...actual, resolveReferenceProviders: mocks.resolveReferenceProviders };
});

import { POST } from "@/app/api/ai/image/route";
import { AiProviderError } from "@/lib/ai/errors";
import { searchReferences } from "@/lib/references/catalog";
import { buildStudioPrompt, studioManifestHash } from "@/lib/ai/studio-context";
import { studioCompositionSchema, studioManifestSchema } from "@/lib/validation/studio";

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
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000003", created_at: "2026-08-03T12:34:56+00:00" },
      error: null,
    }),
  };
  generationUpdate.update.mockReturnValue(generationUpdate);
  generationUpdate.eq.mockReturnValue(generationUpdate);
  generationUpdate.select.mockReturnValue(generationUpdate);
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.example/image.png" }, error: null });
  const storageFrom = vi.fn().mockReturnValue({ upload, remove, createSignedUrl });
  const attachImage = vi.fn().mockResolvedValue({ data: true, error: null });

  let generationRunQueryCount = 0;
  const systemQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { appearance: true, lore: false, creature_traits: false }, error: null }) };
  const from = vi.fn((table: string) => {
    if (table === "campaign_system_reference_settings") return systemQuery;
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
    rpc: vi.fn((name: string, args: unknown) => name === "read_system_references" ? Promise.resolve({ error: null, data: [{
      reference_id: searchReferences("ancestry", "Kasatha")[0].binding.id, kind: "ancestry", name: "Kasatha",
      catalog_version: searchReferences("ancestry", "Kasatha")[0].binding.catalogVersion,
      source_url: searchReferences("ancestry", "Kasatha")[0].sourceUrl, publication: "", revision: 1,
      appearance: "Four arms (user-entered fixture).", lore: "", trait_context: "", source_notes: "", updated_at: null,
    }] }) : attachImage(name, args)),
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

  it.each(["1K", "2K", "4K"])("passes the selected native %s resolution to generation and review", async (resolution) => {
    const supabase = createSupabaseMock();
    const model = "test/native-image";
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: model, NETLIFY_IMAGE_GENERATION: "sync" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: [model] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{
      id: model, capability: "image", compatible: true, inputModalities: ["text"],
      supportedParameters: ["aspect_ratio", "resolution", "size"],
      parameterValues: { resolution: ["1K", "2K", "4K"], aspect_ratio: ["1:1"] },
    }] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model });

    const response = await POST(createRequest({
      campaignId, mode: "create", targetKind: "npc", subject: "A station broker", model, resolution,
    }));

    expect(response.status).toBe(200);
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", expect.any(String), model, expect.objectContaining({ resolution }));
    expect(mocks.generateImage.mock.calls[0][3]).not.toHaveProperty("size");
    expect((await response.json()).draft.resolution).toBe(resolution);
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ requested_resolution: resolution }));
  });

  it("rejects unsupported native resolution before paid work", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "test/image" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["test/image"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{
      id: "test/image", capability: "image", compatible: true,
      supportedParameters: ["resolution"], parameterValues: { resolution: ["1K", "2K"] },
    }] });
    const response = await POST(createRequest({
      campaignId, mode: "create", targetKind: "npc", subject: "A broker", resolution: "4K",
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/resolution|4K/i);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.dispatchImageBackgroundJob).not.toHaveBeenCalled();
  });

  it("preserves the native tier in background acknowledgement and signed dispatch", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "test/image", SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["test/image"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{
      id: "test/image", capability: "image", compatible: true,
      supportedParameters: ["resolution"], parameterValues: { resolution: ["1K", "4K"] },
    }] });
    const response = await POST(createRequest({
      campaignId, mode: "create", targetKind: "npc", subject: "A broker", resolution: "4K",
    }, previewImageUrl));
    expect(response.status).toBe(202);
    expect((await response.json()).job.resolution).toBe("4K");
    expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith(previewImageUrl, expect.objectContaining({ resolution: "4K" }), "worker-secret");
  });

  it.each([
    ["scene", false], ["battlemap", false], ["scene", true], ["battlemap", true],
  ] as const)("keeps %s Studio provenance private in audit rows (background=%s)", async (kind, background) => {
    const supabase = createSupabaseMock();
    const studio = studioCompositionSchema.parse({ useCampaignStyle: false });
    const manifest = studioManifestSchema.parse({ composition: studio, direction: "Private reactor encounter", sources: [], references: [], style: "" });
    const prompt = buildStudioPrompt(kind, manifest);
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", ...(background ? { NETLIFY_IMAGE_GENERATION: "background", SUPABASE_SECRET_KEY: "worker-secret" } : {}) });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });
    const response = await POST(createRequest({
      campaignId, mode: "create", targetKind: kind, purpose: "studio-art", studio, subject: manifest.direction, currentPrompt: prompt,
    }));
    expect(response.status).toBe(background ? 202 : 200);
    const payload = await response.json();
    expect((background ? payload.job : payload.draft).studioManifest).toEqual(manifest);
    expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "studio-art", target_kind: kind, studio_manifest_hash: studioManifestHash(manifest), image_subject: `Studio ${kind}`,
    }));
    expect(JSON.stringify(supabase.generationInsert.insert.mock.calls)).not.toContain(manifest.direction);
    if (background) {
      expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ purpose: "studio-art", prompt }), "worker-secret");
      expect(mocks.generateImage).not.toHaveBeenCalled();
    } else {
      expect(payload.draft.temporaryPath).toContain("/studio-draft-");
      expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", prompt, "openai/gpt-image-1", expect.any(Object));
    }
  });

  it("requires renewed prompt review when Studio context changes, before a charged request", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    const response = await POST(createRequest({
      campaignId, mode: "create", targetKind: "scene", purpose: "studio-art", studio: {}, subject: "Reactor encounter", currentPrompt: "Stale reviewed prompt",
    }));
    expect(response.status).toBe(409);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.dispatchImageBackgroundJob).not.toHaveBeenCalled();
    expect(supabase.generationInsert.insert).not.toHaveBeenCalled();
  });

  describe("redo and edit lineage", () => {
    const editableModel = { id: "openai/gpt-image-1", capability: "image", compatible: true, inputModalities: ["text", "image"] };
    const instruction = "Replace the jacket with a crimson flight suit";
    const editBody = { campaignId, mode: "refine", operation: "edit", targetKind: "npc", edit: { instruction, source: { type: "saved-art", entityId: "00000000-0000-4000-8000-000000000008" } } };

    function arrangeEdit(models = [editableModel], env: Record<string, string> = {}) {
      const supabase = createSupabaseMock();
      mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
      mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", ...env });
      mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
      mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models });
      mocks.resolveEditSource.mockResolvedValue({ path: `${campaignId}/${userId}/npc-source.png`, kind: "saved-art" });
      mocks.resolveReferenceProviders.mockResolvedValue(["openai"]);
      mocks.loadEditSourceImage.mockResolvedValue([{ dataUrl: "data:image/png;base64,c291cmNl" }]);
      mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });
      return supabase;
    }

    it("sends the source image to the provider and records edit lineage without the instruction", async () => {
      const supabase = arrangeEdit();
      const response = await POST(createRequest(editBody));
      expect(response.status).toBe(200);
      expect(mocks.resolveReferenceProviders).toHaveBeenCalledWith("campaign-key", "openai/gpt-image-1", 1);
      expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", expect.stringContaining(instruction), "openai/gpt-image-1", expect.objectContaining({
        imageReferences: [{ dataUrl: "data:image/png;base64,c291cmNl" }], referenceProviders: ["openai"],
      }));
      expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ operation: "edit", edit_source_kind: "saved-art", mode: "refine" }));
      expect(JSON.stringify(supabase.generationInsert.insert.mock.calls)).not.toContain(instruction);
      expect((await response.json()).draft).toMatchObject({ operation: "edit", subject: "Edited artwork" });
    });

    it("links an edited draft to its source draft run", async () => {
      const supabase = arrangeEdit();
      mocks.resolveEditSource.mockResolvedValue({ path: `${campaignId}/${userId}/image-source.png`, kind: "draft", parentRunId: "00000000-0000-4000-8000-000000000009" });
      const response = await POST(createRequest({ ...editBody, edit: { instruction, source: { type: "draft", generationRunId: "00000000-0000-4000-8000-000000000009" } } }));
      expect(response.status).toBe(200);
      expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ operation: "edit", edit_source_kind: "draft", parent_run_id: "00000000-0000-4000-8000-000000000009" }));
    });

    it("queues an edit with a signed source path and no Studio references", async () => {
      arrangeEdit([editableModel], { SUPABASE_SECRET_KEY: "worker-secret", NETLIFY_IMAGE_GENERATION: "background" });
      const response = await POST(createRequest(editBody, previewImageUrl));
      expect(response.status).toBe(202);
      expect(mocks.generateImage).not.toHaveBeenCalled();
      const job = mocks.dispatchImageBackgroundJob.mock.calls[0][1];
      expect(job).toMatchObject({ editSource: { path: `${campaignId}/${userId}/npc-source.png` }, referenceProviders: ["openai"] });
      expect(job).not.toHaveProperty("imageReferences");
      expect((await response.json()).job).toMatchObject({ operation: "edit" });
    });

    it("refuses an edit when the selected model cannot accept image input", async () => {
      const supabase = arrangeEdit([{ ...editableModel, inputModalities: ["text"] }]);
      const response = await POST(createRequest(editBody));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/cannot edit images/i);
      expect(mocks.resolveEditSource).not.toHaveBeenCalled();
      expect(mocks.generateImage).not.toHaveBeenCalled();
      expect(supabase.generationInsert.insert).not.toHaveBeenCalled();
    });

    it("does not call the provider when no endpoint supports image references", async () => {
      arrangeEdit();
      const { StudioError } = await import("@/lib/ai/studio-context");
      mocks.resolveReferenceProviders.mockRejectedValue(new StudioError("This model has no verified endpoint supporting the selected image references.", 400));
      const response = await POST(createRequest(editBody));
      expect(response.status).toBe(400);
      expect(mocks.generateImage).not.toHaveBeenCalled();
    });

    it("surfaces source authorization failures", async () => {
      arrangeEdit();
      const { StudioError } = await import("@/lib/ai/studio-context");
      mocks.resolveEditSource.mockRejectedValue(new StudioError("The draft to edit is no longer available.", 404));
      const response = await POST(createRequest(editBody));
      expect(response.status).toBe(404);
      expect(mocks.generateImage).not.toHaveBeenCalled();
    });

    it("rejects edit details on a plain generation", async () => {
      const response = await POST(createRequest({ ...editBody, operation: "generate" }));
      expect(response.status).toBe(400);
    });

    it("records a redo against a verified parent run", async () => {
      const supabase = createSupabaseMock();
      const parentQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "00000000-0000-4000-8000-000000000009" }, error: null }) };
      const original = supabase.from.getMockImplementation()!;
      let parentServed = false;
      supabase.from.mockImplementation((table: string) => {
        if (table === "ai_generation_runs" && !parentServed) { parentServed = true; return parentQuery; }
        return original(table);
      });
      mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
      mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
      mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
      mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [editableModel] });
      mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });

      const response = await POST(createRequest({ campaignId, mode: "refine", operation: "redo", parentRunId: "00000000-0000-4000-8000-000000000009", targetKind: "npc", subject: "A masked station broker" }));
      expect(response.status).toBe(200);
      expect(supabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ operation: "redo", parent_run_id: "00000000-0000-4000-8000-000000000009" }));
      expect(supabase.generationInsert.insert.mock.calls[0][0]).not.toHaveProperty("edit_source_kind");
    });
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

  it.each(["npc", "enemy"] as const)("grounds direct %s artwork identically in synchronous and signed background paths", async (targetKind) => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });
    const binding = searchReferences("ancestry", "Kasatha")[0].binding;
    const body = { campaignId, mode: "create", targetKind, subject: "A pilot with a missing arm.",
      ...(targetKind === "npc" ? { npcReferenceContext: { species: "Kasatha", ancestryReference: binding } } : { enemyReferenceContext: { ancestryReference: binding } }) };
    const sync = await POST(createRequest(body));
    expect(sync.status).toBe(200);
    const syncDraft = (await sync.json()).draft;
    expect(syncDraft.prompt).toContain("Four arms");
    expect(syncDraft.prompt).toContain("missing arm");
    expect(syncDraft.references[0].id).toBe(binding.id);
    const queuedSupabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase: queuedSupabase, user: { id: userId }, role: "gm" });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1", NETLIFY_IMAGE_GENERATION: "background", SUPABASE_SECRET_KEY: "worker-secret" });
    mocks.dispatchImageBackgroundJob.mockResolvedValue(undefined);
    const queued = await POST(createRequest(body));
    expect(queued.status).toBe(202);
    const job = (await queued.json()).job;
    expect(job.prompt).toBe(syncDraft.prompt);
    expect(job.references).toEqual(syncDraft.references);
    expect(mocks.dispatchImageBackgroundJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prompt: syncDraft.prompt, references: syncDraft.references }), "worker-secret");
    expect(queuedSupabase.generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ reference_sources: syncDraft.references }));
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
    expect(payload.outcomeUnknown).toBe(true);
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