import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiContext: vi.fn(),
  recordAiGeneration: vi.fn(),
  buildVisualStylePrompt: vi.fn(() => "visual-style-prompt"),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
  resolveCampaignCredential: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/assistance", () => ({
  loadCampaignAiContext: mocks.loadCampaignAiContext,
  recordAiGeneration: mocks.recordAiGeneration,
}));
vi.mock("@/lib/ai/visual-style-prompt", () => ({ buildVisualStylePrompt: mocks.buildVisualStylePrompt }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/route-support", () => ({
  campaignCredentialErrorResponse: vi.fn(() => Response.json({ error: "credential error" }, { status: 503 })),
  resolveCampaignCredential: mocks.resolveCampaignCredential,
}));

import { POST } from "@/app/api/ai/visual-style/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function request(fields: Record<string, string>, files: File[] = []) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
  files.forEach((file) => formData.append("referenceImages", file));
  return new Request("http://localhost/api/ai/visual-style", { method: "POST", body: formData });
}

const draft = {
  name: "Neon frontier",
  visualStyle: "Crisp ink lines, electric cyan accents, and deep shadowed space with warm amber points of light.",
  rationale: "Keeps the campaign readable while preserving frontier tension.",
};

function pngFile() {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "reference.png", { type: "image/png" });
}

describe("visual style assistance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key" });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: userId }, role: "gm" });
    mocks.loadCampaignAiContext.mockResolvedValue({ campaign: { system: "Starfinder 2e", description: "A tense frontier campaign", visualStyle: "Cinematic sci-fi realism" } });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true, inputModalities: ["text"] }] });
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openai/gpt-4o-mini", generationId: "style-run-1" });
    mocks.recordAiGeneration.mockResolvedValue({ error: null });
  });

  it("returns a validated draft without persisting reference images", async () => {
    const response = await POST(request({ campaignId, campaignVibe: "Hopeful but dangerous", artDirection: "choose-for-me" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.buildVisualStylePrompt).toHaveBeenCalledWith(expect.objectContaining({ campaignId, campaignVibe: "Hopeful but dangerous" }), expect.objectContaining({ system: "Starfinder 2e" }));
    expect(mocks.generateJson).toHaveBeenCalledWith("campaign-key", "visual-style-prompt", expect.anything(), "openai/gpt-4o-mini", { imageReferences: [] });
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "visual-style", status: "complete" }));
  });

  it("passes bounded example images only to a vision-capable text model", async () => {
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true, inputModalities: ["image", "text"] }] });

    const response = await POST( request({ campaignId, artDirection: "cinematic-realism" }, [pngFile()]));

    expect(response.status).toBe(200);
    const options = mocks.generateJson.mock.calls[0][4] as { imageReferences: Array<{ dataUrl: string }> };
    expect(options.imageReferences).toHaveLength(1);
    expect(options.imageReferences[0].dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects an example with invalid image bytes", async () => {
    const invalidFile = new File(["not an image"], "reference.png", { type: "image/png" });
    const response = await POST(request({ campaignId }, [invalidFile]));

    expect(response.status).toBe(400);
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });
});
