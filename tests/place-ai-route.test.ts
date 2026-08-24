import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiContext: vi.fn(),
  loadPlaceAiContext: vi.fn(),
  recordAiGeneration: vi.fn(),
  buildPlacePrompt: vi.fn(() => "place-prompt"),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/assistance", () => ({
  loadCampaignAiContext: mocks.loadCampaignAiContext,
  loadPlaceAiContext: mocks.loadPlaceAiContext,
  recordAiGeneration: mocks.recordAiGeneration,
}));
vi.mock("@/lib/ai/prompts", () => ({ buildPlacePrompt: mocks.buildPlacePrompt }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));

import { POST as generatePlace } from "@/app/api/ai/place/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const rootId = "00000000-0000-4000-8000-000000000003";
const parentId = "00000000-0000-4000-8000-000000000004";

function request(body: unknown) {
  return new Request("http://localhost/api/ai/place", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createPlacesQuery() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    eq: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.then = vi.fn((onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve({
    data: [
      { id: rootId, campaign_id: campaignId, parent_place_id: null, name: "Asterion", kind: "planet" },
      { id: parentId, campaign_id: campaignId, parent_place_id: rootId, name: "Night Market", kind: "district" },
    ],
    error: null,
  }).then(onFulfilled, onRejected));
  return query;
}

describe("AI place assistance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini" });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: { from: vi.fn().mockReturnValue(createPlacesQuery()) }, user: { id: userId }, role: "gm" });
    mocks.loadCampaignAiContext.mockResolvedValue({ campaign: { system: "Starfinder 2e", description: "A frontier campaign", artStyleSuffix: "Cinematic sci-fi realism" } });
    mocks.loadPlaceAiContext.mockResolvedValue({ context: undefined });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true }] });
    mocks.recordAiGeneration.mockResolvedValue({ error: null });
  });

  it("requires GM access before generating a place draft", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await generatePlace(request({ campaignId, mode: "create", kind: "district" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required for AI place assistance.");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("passes the parent hierarchy into the prompt and audits the draft", async () => {
    const draft = {
      name: "The Blue Door",
      kind: "room",
      description: "A hidden room behind the market chapel.",
      playerNotes: "The door only appears during power outages.",
      gmNotes: "It opens into a pre-collapse transit line.",
      visualPrompt: "A blue metal door hidden behind a crowded market shrine.",
    };
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
    mocks.loadPlaceAiContext.mockResolvedValue({ context: placeContext });
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openai/gpt-4o-mini", generationId: "place-run-1", usage: { inputTokens: 14, outputTokens: 42, cost: 0.002 } });

    const response = await generatePlace(request({ campaignId, mode: "create", parentPlaceId: parentId, name: "The Blue Door", kind: "room" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.loadPlaceAiContext).toHaveBeenCalledWith(expect.anything(), campaignId, parentId);
    expect(mocks.buildPlacePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId, parentPlaceId: parentId, name: "The Blue Door" }),
      expect.objectContaining({ system: "Starfinder 2e" }),
      placeContext,
    );
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      campaignId,
      userId,
      kind: "place",
      status: "complete",
      model: "openai/gpt-4o-mini",
      generationId: "place-run-1",
      inputTokens: 14,
      outputTokens: 42,
      costUsd: 0.002,
    }));
  });

  it("rejects an invalid Place parent before calling the provider", async () => {
    mocks.loadPlaceAiContext.mockResolvedValue({ error: "Place parent must belong to this campaign.", invalid: true });

    const response = await generatePlace(request({ campaignId, mode: "create", parentPlaceId: parentId, kind: "room" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Place parent must belong to this campaign.");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("returns an unavailable response when Place context cannot be loaded", async () => {
    mocks.loadPlaceAiContext.mockResolvedValue({ error: "Place hierarchy could not be loaded.", unavailable: true });

    const response = await generatePlace(request({ campaignId, mode: "create", parentPlaceId: parentId, kind: "room" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Place hierarchy could not be loaded.");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });
});
