import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  loadCharacterPortraitAccess: vi.fn(),
  loadCampaignAiContext: vi.fn(),
  recordAiGeneration: vi.fn(),
  buildCharacterPrompt: vi.fn(() => "character-prompt"),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
  resolveCampaignCredential: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/ai/character-portrait-access", () => ({ loadCharacterPortraitAccess: mocks.loadCharacterPortraitAccess }));
vi.mock("@/lib/ai/assistance", () => ({ loadCampaignAiContext: mocks.loadCampaignAiContext, recordAiGeneration: mocks.recordAiGeneration }));
vi.mock("@/lib/ai/prompts", () => ({ buildCharacterPrompt: mocks.buildCharacterPrompt }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/route-support", () => ({ campaignCredentialErrorResponse: vi.fn(), resolveCampaignCredential: mocks.resolveCampaignCredential }));

import { POST as generateCharacterPrompt } from "@/app/api/ai/character/route";
import { searchReferences } from "@/lib/references/catalog";

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
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini" });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: userId } });
    mocks.loadCharacterPortraitAccess.mockResolvedValue({
      access: {
        character: {
          id: "00000000-0000-4000-8000-000000000003",
          campaign_id: campaignId,
          owner_id: userId,
          name: "Nova",
          species: "Android",
          class_name: "Mechanic",
          level: 3,
          backstory_markdown: "A survivor of a derelict ship.",
          physical_description: "Tall with silver eyes.",
        },
        role: "player",
        isOwner: true,
      },
    });
    mocks.loadCampaignAiContext.mockResolvedValue({ campaign: { system: "Starfinder 2e", description: "A tense frontier campaign", visualStyle: "Retro-futurist" } });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true }] });
    mocks.resolveCampaignCredential.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: true } });
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

    const response = await generateCharacterPrompt(request({ campaignId, characterId: "00000000-0000-4000-8000-000000000003", mode: "create", name: "Nova", species: "Android", className: "Mechanic", backstoryMarkdown: "A survivor of a derelict ship.", physicalDescription: "Tall with silver eyes." }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.generateJson).toHaveBeenCalledWith("campaign-key", "character-prompt", expect.anything(), "openai/gpt-4o-mini");
    expect(mocks.buildCharacterPrompt).toHaveBeenCalledWith(expect.objectContaining({ backstoryMarkdown: "A survivor of a derelict ship.", physicalDescription: "Tall with silver eyes." }), expect.objectContaining({ system: "Starfinder 2e" }), "", { text: "", sources: [] });
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ campaignId, userId, kind: "character", status: "complete", model: "openai/gpt-4o-mini", provider: "openrouter", effectiveModel: "openrouter/fallback", generationId: "character-run-1" }));
  });

  it("rejects a user without campaign membership", async () => {
    mocks.loadCharacterPortraitAccess.mockResolvedValue({ failure: "membership" });

    const response = await generateCharacterPrompt(request({ campaignId, characterId: "00000000-0000-4000-8000-000000000003", mode: "create", physicalDescription: "Tall with silver eyes." }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Campaign membership is required for AI character assistance.");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("grounds from saved bindings rather than forged client ancestry", async () => {
    const binding = searchReferences("ancestry", "Kasatha")[0].binding;
    const saved = await mocks.loadCharacterPortraitAccess();
    saved.access.character = { ...saved.access.character, species: "Kasatha", ancestry_reference_id: binding.id, ancestry_catalog_version: binding.catalogVersion };
    mocks.loadCharacterPortraitAccess.mockResolvedValue(saved);
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { appearance: true, lore: false, creature_traits: false }, error: null }) };
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: userId }, supabase: {
      from: vi.fn(() => query),
      rpc: vi.fn(async () => ({ error: null, data: [{
        reference_id: binding.id, kind: "ancestry", name: "Kasatha", catalog_version: binding.catalogVersion,
        source_url: searchReferences("ancestry", "Kasatha")[0].sourceUrl, publication: "", revision: 1,
        appearance: "Four arms (user-entered fixture).", lore: "", trait_context: "", source_notes: "", updated_at: null,
      }] })),
    } });
    mocks.generateJson.mockResolvedValue({ data: { visualPrompt: "An individual portrait." }, model: "openai/gpt-4o-mini" });
    const response = await generateCharacterPrompt(request({ campaignId, characterId: saved.access.character.id, mode: "create", species: "Vesk", ancestryReference: searchReferences("ancestry", "Vesk")[0].binding }));
    expect(response.status).toBe(200);
    expect(mocks.buildCharacterPrompt).toHaveBeenCalledWith(expect.anything(), expect.anything(), "", expect.objectContaining({ text: expect.stringContaining("Four arms") }));
    expect((await response.json()).references[0].id).toBe(binding.id);
  });
});