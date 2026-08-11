import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiContext: vi.fn(),
  recordAiGeneration: vi.fn(),
  buildMissionPrompt: vi.fn(() => "mission-prompt"),
  buildNpcPrompt: vi.fn(() => "npc-prompt"),
  buildFactionPrompt: vi.fn(() => "faction-prompt"),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/assistance", () => ({
  loadCampaignAiContext: mocks.loadCampaignAiContext,
  recordAiGeneration: mocks.recordAiGeneration,
}));
vi.mock("@/lib/ai/prompts", () => ({
  buildMissionPrompt: mocks.buildMissionPrompt,
  buildNpcPrompt: mocks.buildNpcPrompt,
  buildFactionPrompt: mocks.buildFactionPrompt,
}));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));

import { POST as generateFaction } from "@/app/api/ai/faction/route";
import { POST as generateMission } from "@/app/api/ai/mission/route";
import { POST as generateNpc } from "@/app/api/ai/npc/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown) {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseInput = { campaignId, mode: "create" as const };

describe("structured AI assistance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini" });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: userId }, role: "gm" });
    mocks.loadCampaignAiContext.mockResolvedValue({ campaign: { system: "Starfinder 2e", description: "A tense frontier campaign", artStyleSuffix: "Cinematic sci-fi realism" } });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini", "google/gemini-2.5-flash", "openai/gpt-4o", "openai/gpt-image-1", "google/gemini-2.5-flash-image", "bytedance-seed/seedream-4.5"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [
      { id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true },
      { id: "google/gemini-2.5-flash", capability: "structured-text", compatible: true },
      { id: "openai/gpt-4o", capability: "structured-text", compatible: true },
    ] });
    mocks.recordAiGeneration.mockResolvedValue({ error: null });
  });

  it("rejects malformed requests before checking GM access", async () => {
    const response = await generateFaction(request({}));

    expect(response.status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("requires GM access for NPC assistance", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await generateNpc(request({ ...baseInput, name: "Broker", role: "Contact" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required for AI NPC assistance.");
  });

  it("returns a validated faction draft and records metadata", async () => {
    const draft = { name: "The Glass Meridian", status: "active", description: "A trade consortium with a public relief arm.", visualPrompt: "A fractured glass compass over a star chart." };
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openrouter/fallback", generationId: "text-run-1", usage: { inputTokens: 12, outputTokens: 34, cost: 0.001 } });

    const response = await generateFaction(request({ ...baseInput, focus: "Make it useful as a mission giver." }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.buildFactionPrompt).toHaveBeenCalledWith(expect.objectContaining({ campaignId, focus: "Make it useful as a mission giver." }), expect.objectContaining({ system: "Starfinder 2e" }));
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ campaignId, userId, kind: "faction", status: "complete", model: "openai/gpt-4o-mini", provider: "openrouter", effectiveModel: "openrouter/fallback", generationId: "text-run-1", inputTokens: 12, outputTokens: 34, costUsd: 0.001 }));
  });

  it("returns a validated mission draft using the structured output schema", async () => {
    const draft = { title: "The Relay", summary: "A damaged relay is broadcasting a distress signal.", playerNotes: "Find the relay and decide who gets rescued first.", gmNotes: "The signal is being replayed by a hidden saboteur.", hook: "The distress call uses a crew member's voice.", suggestedGiverType: "npc", suggestedGiverName: "Relay Keeper Venn", thumbnailDescription: "A damaged orbital relay sparking above a blue gas giant." };
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openrouter/fallback", generationId: "text-run-2", usage: { inputTokens: 12, outputTokens: 34, cost: 0.001 } });

    const response = await generateMission(request({ ...baseInput, title: "The Relay" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.generateJson).toHaveBeenCalledWith("mission-prompt", expect.anything(), "openai/gpt-4o-mini");
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ campaignId, userId, kind: "mission", status: "complete", model: "openai/gpt-4o-mini", provider: "openrouter", effectiveModel: "openrouter/fallback", generationId: "text-run-2", inputTokens: 12, outputTokens: 34, costUsd: 0.001 }));
  });

  it("accepts a compatible model supplied by the live OpenRouter catalog", async () => {
    const liveModel = "anthropic/claude-sonnet-4";
    const draft = { title: "The Relay", summary: "A damaged relay is broadcasting a distress signal.", playerNotes: "Find the relay and decide who gets rescued first.", gmNotes: "The signal is being replayed by a hidden saboteur.", hook: "The distress call uses a crew member's voice.", suggestedGiverType: "npc", suggestedGiverName: "Relay Keeper Venn", thumbnailDescription: "A damaged orbital relay sparking above a blue gas giant." };
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: liveModel, capability: "structured-text", compatible: true }] });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: [liveModel] } });
    mocks.generateJson.mockResolvedValue({ data: draft, model: liveModel, generationId: "text-run-live" });

    const response = await generateMission(request({ ...baseInput, title: "The Relay", model: liveModel }));

    expect(response.status).toBe(200);
    expect(mocks.generateJson).toHaveBeenCalledWith("mission-prompt", expect.anything(), liveModel);
  });

  it("rejects a model outside the live catalog before calling the provider", async () => {
    const response = await generateMission(request({ ...baseInput, model: "provider/arbitrary-model" }));

    expect(response.status).toBe(400);
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.recordAiGeneration).not.toHaveBeenCalled();
  });

});