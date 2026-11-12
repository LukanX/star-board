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
import { visualStyleDraftOutputSchema } from "@/lib/validation/visual-style";

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
    expect(payload).not.toHaveProperty("trimming");
    expect(mocks.buildVisualStylePrompt).toHaveBeenCalledWith(expect.objectContaining({ campaignId, campaignVibe: "Hopeful but dangerous" }), expect.objectContaining({ system: "Starfinder 2e" }));
    expect(mocks.generateJson).toHaveBeenCalledWith("campaign-key", "visual-style-prompt", expect.anything(), "openai/gpt-4o-mini", { imageReferences: [] });
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "visual-style", status: "complete" }));
  });

  it("requests the compact structured output schema and leaves exactly 300 characters unchanged", async () => {
    const exactDraft = { ...draft, visualStyle: "x".repeat(300) };
    mocks.generateJson.mockResolvedValue({ data: exactDraft });

    const response = await POST(request({ campaignId }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(exactDraft);
    expect(payload).not.toHaveProperty("trimming");
    expect(mocks.generateJson.mock.calls[0][2]).toBe(visualStyleDraftOutputSchema);
  });

  it.each([
    ["clause boundaries", "Crisp ink contours; cyan and amber palette; dramatic rim lighting; readable silhouettes; restrained grain. ".repeat(8)],
    ["word boundaries", "Atmospheric layered paint with muted colors and grounded materials ".repeat(12)],
    ["no delimiters", "x".repeat(301)],
    ["provider safety boundary", "x".repeat(1200)],
  ])("trims overlong valid output at %s without another provider call", async (_label, visualStyle) => {
    mocks.generateJson.mockResolvedValue({ data: { ...draft, visualStyle: visualStyle.trim() }, model: "openai/gpt-4o-mini", generationId: "trimmed-style-run" });

    const response = await POST(request({ campaignId }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toMatchObject({ name: draft.name, rationale: draft.rationale });
    expect(payload.draft.visualStyle.length).toBeLessThanOrEqual(300);
    expect(payload.draft.visualStyle.length).toBeGreaterThan(0);
    expect(payload.draft.visualStyle.endsWith("…")).toBe(true);
    expect(visualStyle.trim().startsWith(payload.draft.visualStyle.slice(0, -1))).toBe(true);
    expect(visualStyleDraftOutputSchema.safeParse(payload.draft).success).toBe(true);
    expect(payload.trimming).toEqual({ originalLength: visualStyle.trim().length, includedLength: payload.draft.visualStyle.length });
    expect(mocks.generateJson).toHaveBeenCalledTimes(1);
    expect(mocks.recordAiGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "visual-style", status: "complete", generationId: "trimmed-style-run" }));
    const audit = mocks.recordAiGeneration.mock.calls[0][1];
    expect(JSON.stringify(audit)).not.toContain(visualStyle.trim());
  });

  it.each([
    { ...draft, visualStyle: "" },
    { ...draft, visualStyle: " padded" },
    { ...draft, visualStyle: "padded " },
    { ...draft, visualStyle: "x".repeat(1201) },
    { ...draft, visualStyle: 42 },
    { ...draft, name: "x".repeat(81) },
    { ...draft, rationale: "x".repeat(601) },
    { name: draft.name, visualStyle: draft.visualStyle },
  ])("rejects invalid provider output rather than trimming it into a valid draft: %j", async (data) => {
    mocks.generateJson.mockResolvedValue({ data });

    const response = await POST(request({ campaignId }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "The AI response did not match the visual style draft format." });
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
    expect(mocks.generateJson).toHaveBeenCalledTimes(1);
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
