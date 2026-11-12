import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCampaignGM: vi.fn(), resolveCampaignCredential: vi.fn(), generateJson: vi.fn(),
  getAiModelCatalog: vi.fn(), loadCampaignAiSettings: vi.fn(), getServerEnv: vi.fn(),
  recordAiGeneration: vi.fn(), loadPlaceAiContext: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/ai/assistance", () => ({ recordAiGeneration: mocks.recordAiGeneration, loadPlaceAiContext: mocks.loadPlaceAiContext }));
vi.mock("@/lib/ai/route-support", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai/route-support")>(),
  resolveCampaignCredential: mocks.resolveCampaignCredential,
}));

import { POST } from "@/app/api/ai/art-prompt/route";
import { AiProviderError } from "@/lib/ai/errors";
const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const input = { campaignId, kind: "scene", direction: "Crew fighting beside the reactor", composition: {}, model: "test/text" };
function request(body: unknown = input) {
  return new Request("http://localhost/api/ai/art-prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function styleClient(style = "Painted space opera") {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { visual_style: style, name: "Crew", physical_description: "d".repeat(700), art_path: null, updated_at: "2026-10-29T00:00:00Z" }, error: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  return { from: vi.fn().mockReturnValue(query) };
}

describe("Studio prompt assistance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCampaignGM.mockResolvedValue({ supabase: styleClient(), user: { id: userId }, role: "gm" });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "test-key" });
    mocks.getAiModelCatalog.mockResolvedValue({ models: [{ id: "test/text", compatible: true, capability: "structured-text" }] });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["test/text"] } });
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_TEXT_MODEL: "test/text" });
    mocks.recordAiGeneration.mockResolvedValue({ error: null });
    mocks.generateJson.mockResolvedValue({ data: { prompt: "The crew confronts a monster beneath the reactor lights." }, model: "test/text", generationId: "test-generation", usage: { inputTokens: 10, outputTokens: 20, cost: 0.001 } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("validates before authorization and rejects actor-based maps", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ ...input, kind: "battlemap", composition: { subjects: [{ kind: "character", id: userId }] } }))).status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });
  it("denies players before provider or usage access", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.recordAiGeneration).not.toHaveBeenCalled();
  });
  it("returns only an unapplied candidate and records separate text-model usage without raw prompts", async () => {
    const response = await POST(request({ ...input, feedback: "Add more tactical cover" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft: { prompt: "The crew confronts a monster beneath the reactor lights." }, allowance: 1200 });
    expect(mocks.generateJson).toHaveBeenCalledWith("test-key", expect.stringContaining("Do not generate or save an image"), expect.anything(), "test/text", { timeoutMs: 45_000 });
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      campaignId, userId, purpose: "studio-prompt", mode: "refine", status: "complete", model: "test/text",
      inputTokens: 10, outputTokens: 20, costUsd: 0.001, generationId: "test-generation", promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(mocks.recordAiGeneration.mock.calls)).not.toContain(input.direction);
    expect(JSON.stringify(mocks.recordAiGeneration.mock.calls)).not.toContain("confronts a monster");
  });
  it("tells the model the remaining allowance and retries once when the draft is too long", async () => {
    const crowded = { ...input, composition: { subjects: Array.from({ length: 6 }, (_, index) => ({ kind: "character", id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) } };
    mocks.requireCampaignGM.mockResolvedValue({ supabase: styleClient("s".repeat(1200)), user: { id: userId }, role: "gm" });
    mocks.generateJson
      .mockResolvedValueOnce({ data: { prompt: "x".repeat(1100) }, model: "test/text" })
      .mockResolvedValueOnce({ data: { prompt: "A compact reactor fight." }, model: "test/text" });
    const response = await POST(request(crowded));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.draft.prompt).toBe("A compact reactor fight.");
    expect(payload.allowance).toBeLessThan(1200);
    expect(payload.allowance).toBeGreaterThanOrEqual(300);
    expect(mocks.generateJson.mock.calls[0][1]).toContain(`at most ${payload.allowance} characters`);
    expect(mocks.generateJson.mock.calls[0][1]).toContain("do not repeat them");
    expect(mocks.generateJson.mock.calls[1][1]).toContain("Your previous answer was 1100 characters");
    expect(mocks.recordAiGeneration).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ status: "failed" }));
    expect(mocks.recordAiGeneration).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ status: "complete" }));
  });
  it("never silently truncates a draft that remains over the allowance", async () => {
    mocks.requireCampaignGM.mockResolvedValue({ supabase: styleClient("s".repeat(1200)), user: { id: userId }, role: "gm" });
    mocks.generateJson.mockResolvedValue({ data: { prompt: "x".repeat(1150) }, model: "test/text" });
    const response = await POST(request({ ...input, composition: { subjects: Array.from({ length: 6 }, (_, index) => ({ kind: "character", id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) } }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("characters available");
    expect(mocks.generateJson).toHaveBeenCalledTimes(2);
  });
  it("enforces campaign model allowlists before generation", async () => {
    const response = await POST(request({ ...input, model: "other/disabled" }));
    expect(response.status).toBe(400);
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });
  it("preserves rate limits and failed usage without exposing provider payloads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generateJson.mockRejectedValue(new AiProviderError("Provider rate limited", { status: 429, retryAfter: "12", providerBody: "{\"private\":\"diagnostic\"}" }));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(JSON.stringify(await response.json())).not.toContain("diagnostic");
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ purpose: "studio-prompt", status: "failed" }));
  });
  it("rejects malformed provider output and explicitly surfaces audit failure", async () => {
    mocks.generateJson.mockResolvedValue({ data: { prompt: "" }, model: "test/text" });
    expect((await POST(request())).status).toBe(502);
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
    mocks.recordAiGeneration.mockResolvedValue({ error: { code: "unavailable" } });
    expect((await POST(request())).status).toBe(503);
  });
});
