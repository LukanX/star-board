import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  loadCampaignAiContext: vi.fn(),
  recordAiGeneration: vi.fn(),
  buildCharacterPrompt: vi.fn(() => "character-prompt"),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser, getCampaignMembership: mocks.getCampaignMembership }));
vi.mock("@/lib/ai/assistance", () => ({ loadCampaignAiContext: mocks.loadCampaignAiContext, recordAiGeneration: mocks.recordAiGeneration }));
vi.mock("@/lib/ai/prompts", () => ({ buildCharacterPrompt: mocks.buildCharacterPrompt }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));

import { POST as generateCharacterPrompt } from "@/app/api/ai/character/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown) {
  return new Request("http://localhost/api/ai/character", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("character portrait prompt route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini" });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });
    mocks.loadCampaignAiContext.mockResolvedValue({ campaign: { system: "Starfinder 2e", description: "A tense frontier campaign", artStyleSuffix: "Retro-futurist" } });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true }] });
    mocks.recordAiGeneration.mockResolvedValue({ error: null });
  });

  it("requires a valid request before checking membership", async () => {
    const response = await generateCharacterPrompt(request({ campaignId }));

    expect(response.status).toBe(400);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("allows a campaign member to generate a reviewed portrait prompt", async () => {
    const draft = { visualPrompt: "A silver-eyed android mechanic in a patched flight jacket." };
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openrouter/fallback", generationId: "character-run-1", usage: { inputTokens: 12, outputTokens: 18, cost: 0.001 } });

    const response = await generateCharacterPrompt(request({ campaignId, mode: "create", name: "Nova", species: "Android", className: "Mechanic", backstoryMarkdown: "A survivor of a derelict ship.", physicalDescription: "Tall with silver eyes." }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.buildCharacterPrompt).toHaveBeenCalledWith(expect.objectContaining({ backstoryMarkdown: "A survivor of a derelict ship.", physicalDescription: "Tall with silver eyes." }), expect.objectContaining({ system: "Starfinder 2e" }));
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ campaignId, userId, kind: "character", status: "complete", model: "openai/gpt-4o-mini", provider: "openrouter", effectiveModel: "openrouter/fallback", generationId: "character-run-1" }));
  });

  it("rejects a user without campaign membership", async () => {
    mocks.getCampaignMembership.mockResolvedValue(null);

    const response = await generateCharacterPrompt(request({ campaignId, mode: "create", physicalDescription: "Tall with silver eyes." }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Campaign membership is required for AI character assistance.");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });
});