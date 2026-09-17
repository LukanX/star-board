import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
  resolveCampaignCredential: vi.fn(),
  dispatchImageBackgroundJob: vi.fn(),
  loadPlaceAiContext: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/ai/client", () => ({ generateImage: mocks.generateImage }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/assistance", () => ({ loadPlaceAiContext: mocks.loadPlaceAiContext }));
vi.mock("@/lib/ai/image-jobs", () => ({ dispatchImageBackgroundJob: mocks.dispatchImageBackgroundJob }));
vi.mock("@/lib/ai/route-support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/route-support")>();
  return { ...actual, resolveCampaignCredential: mocks.resolveCampaignCredential };
});

import { POST } from "@/app/api/ai/image/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const generationRunId = "00000000-0000-4000-8000-000000000003";

function request(body: unknown) {
  return new Request("http://localhost/api/ai/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(updateError: { message: string } | null = null) {
  const campaignQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { system: "Starfinder 2e", description: "A tense frontier campaign", visual_style: "Campaign default" }, error: null }),
  };
  campaignQuery.select.mockReturnValue(campaignQuery);
  campaignQuery.eq.mockReturnValue(campaignQuery);

  const generationInsert = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { id: generationRunId, created_at: "2026-08-03T12:34:56+00:00" }, error: null }),
  };
  generationInsert.insert.mockReturnValue(generationInsert);
  generationInsert.select.mockReturnValue(generationInsert);

  const generationUpdate = {
    update: vi.fn(),
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  };
  generationUpdate.update.mockReturnValue(generationUpdate);

  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.example/style-preview" }, error: null });
  const storageFrom = vi.fn().mockReturnValue({ upload, remove, createSignedUrl });

  return {
    supabase: {
      from: vi.fn().mockReturnValueOnce(campaignQuery).mockReturnValueOnce(generationInsert).mockReturnValue(generationUpdate),
      storage: { from: storageFrom },
    },
    generationInsert,
    generationUpdate,
    upload,
    remove,
    createSignedUrl,
  };
}

describe("style preview image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key" });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-image-1"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-image-1", capability: "image", compatible: true }] });
    mocks.loadPlaceAiContext.mockResolvedValue({ context: undefined });
    mocks.generateImage.mockResolvedValue({ image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" }, model: "openai/gpt-image-1" });
  });

  it("stores a transient preview and returns its signed URL", async () => {
    const { supabase, generationInsert, generationUpdate, upload, createSignedUrl } = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });

    const response = await POST(request({
      campaignId,
      mode: "create",
      purpose: "style-preview",
      targetKind: "visual-style",
      visualStyleOverride: "Crisp ink and neon light.",
      subject: "A neutral courier skiff in a dust storm",
      model: "openai/gpt-image-1",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toMatchObject({
      purpose: "style-preview",
      targetKind: "visual-style",
      temporaryPath: `${campaignId}/${userId}/style-preview-${generationRunId}.png`,
      image: { base64: null, url: "https://storage.example/style-preview", mediaType: "image/png" },
    });
    expect(generationInsert.insert).toHaveBeenCalledWith(expect.objectContaining({ purpose: "style-preview", target_kind: "visual-style", image_subject: "A neutral courier skiff in a dust storm" }));
    expect(upload).toHaveBeenCalledWith(`${campaignId}/${userId}/style-preview-${generationRunId}.png`, expect.any(Blob), { cacheControl: "3600", contentType: "image/png", upsert: false });
    expect(createSignedUrl).toHaveBeenCalledWith(`${campaignId}/${userId}/style-preview-${generationRunId}.png`, 3600);
    expect(generationUpdate.update).toHaveBeenCalledWith({ image_path: `${campaignId}/${userId}/style-preview-${generationRunId}.png`, image_media_type: "image/png" });
  });

  it("removes the object when preview metadata cannot be saved", async () => {
    const { supabase, remove } = createSupabaseMock({ message: "database unavailable" });
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });

    const response = await POST(request({
      campaignId,
      mode: "create",
      purpose: "style-preview",
      targetKind: "visual-style",
      visualStyleOverride: "Crisp ink and neon light.",
      subject: "A neutral courier skiff in a dust storm",
      model: "openai/gpt-image-1",
    }));

    expect(response.status).toBe(503);
    expect(remove).toHaveBeenCalledWith([`${campaignId}/${userId}/style-preview-${generationRunId}.png`]);
  });
});
