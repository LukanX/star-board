import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiProviderError } from "@/lib/ai/errors";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  requireCampaignGM: vi.fn(),
  loadCampaignAiContext: vi.fn(),
  recordAiGeneration: vi.fn(),
  buildEnemyPrompt: vi.fn(() => "enemy-prompt"),
  loadCampaignAiSettings: vi.fn(),
  getAiModelCatalog: vi.fn(),
  dispatchEnemyBackgroundJob: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/ai/assistance", () => ({ loadCampaignAiContext: mocks.loadCampaignAiContext, recordAiGeneration: mocks.recordAiGeneration }));
vi.mock("@/lib/ai/prompts", () => ({ buildEnemyPrompt: mocks.buildEnemyPrompt }));
vi.mock("@/lib/ai/campaign-settings", () => ({ loadCampaignAiSettings: mocks.loadCampaignAiSettings }));
vi.mock("@/lib/ai/model-discovery", () => ({ getAiModelCatalog: mocks.getAiModelCatalog }));
vi.mock("@/lib/ai/enemy-jobs", () => ({ dispatchEnemyBackgroundJob: mocks.dispatchEnemyBackgroundJob }));

import { POST } from "@/app/api/ai/enemy/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const generationRunId = "00000000-0000-4000-8000-000000000003";
const previewUrl = "https://deploy-preview-10--starboardsf2e.netlify.app/api/ai/enemy";

const draft = {
  name: "Void Stalker",
  playerDescription: "A patient predator that hunts along the hull.",
  level: 5,
  size: "medium" as const,
  rarity: "common" as const,
  traits: ["aberration"],
  family: null,
  statBlock: {
    ...enemyStatBlockSchema.parse({ schemaVersion: 1 }),
    defenses: {
      ...enemyStatBlockSchema.parse({ schemaVersion: 1 }).defenses,
      armorClass: 22,
      hitPoints: [{ label: "HP", value: 80, notes: "" }],
    },
  },
  gmNotesMarkdown: "It avoids bright light.",
  artSubject: "A void stalker on a starship hull.",
};

function request(body: unknown, url = "http://localhost/api/ai/enemy") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock() {
  const generationInsert = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: generationRunId, created_at: "2026-08-27T12:00:00.000Z", status_updated_at: "2026-08-27T12:00:00.000Z" },
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

  return {
    from: vi.fn().mockReturnValueOnce(generationInsert).mockReturnValue(generationUpdate),
    generationInsert,
    generationUpdate,
  };
}

const baseInput = {
  campaignId,
  mode: "create" as const,
  name: "Void Stalker",
  level: 5,
  size: "medium" as const,
  rarity: "common" as const,
  traits: ["aberration"],
  family: null,
  currentDraft: undefined,
};

describe("POST /api/ai/enemy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini", SUPABASE_SECRET_KEY: "worker-secret" });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: {}, user: { id: userId }, role: "gm" });
    mocks.loadCampaignAiContext.mockResolvedValue({ campaign: { system: "Starfinder 2e", description: "A tense frontier campaign", artStyleSuffix: "Cinematic sci-fi realism" } });
    mocks.loadCampaignAiSettings.mockResolvedValue({ settings: { enabledModelIds: ["openai/gpt-4o-mini"] } });
    mocks.getAiModelCatalog.mockResolvedValue({ status: "live", models: [{ id: "openai/gpt-4o-mini", capability: "structured-text", compatible: true }] });
    mocks.recordAiGeneration.mockResolvedValue({ error: null });
    mocks.dispatchEnemyBackgroundJob.mockResolvedValue(undefined);
  });

  it("rejects malformed input before checking campaign access", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });

  it("requires GM access", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await POST(request({ ...baseInput }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required for AI enemy assistance.");
  });

  it("queues on Netlify without waiting for structured generation", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });

    const response = await POST(request(baseInput, previewUrl));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job).toEqual({
      generationRunId,
      status: "pending",
      mode: "create",
      model: "openai/gpt-4o-mini",
      createdAt: "2026-08-27T12:00:00.000Z",
      statusUpdatedAt: "2026-08-27T12:00:00.000Z",
    });
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(mocks.recordAiGeneration).not.toHaveBeenCalled();
    expect(mocks.dispatchEnemyBackgroundJob).toHaveBeenCalledWith(previewUrl, {
      generationRunId,
      prompt: "enemy-prompt",
      model: "openai/gpt-4o-mini",
    }, "worker-secret");
  });

  it("closes the queued run when the background worker cannot be reached", async () => {
    const supabase = createSupabaseMock();
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: userId }, role: "gm" });
    mocks.dispatchEnemyBackgroundJob.mockRejectedValueOnce(new Error("worker unavailable"));

    const response = await POST(request(baseInput, previewUrl));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toContain("could not be started");
    expect(supabase.generationUpdate.update).toHaveBeenCalledWith({
      status: "failed",
      status_updated_at: expect.any(String),
      error_message: "The enemy background worker could not be reached.",
    });
  });

  it("keeps local generation synchronous and records a completed draft", async () => {
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openrouter/fallback", generationId: "enemy-run-1", usage: { inputTokens: 12, outputTokens: 34, cost: 0.001 } });

    const response = await POST(request(baseInput));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toEqual(draft);
    expect(mocks.generateJson).toHaveBeenCalledWith("enemy-prompt", expect.anything(), "openai/gpt-4o-mini");
    expect(mocks.recordAiGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ campaignId, userId, kind: "enemy", status: "complete", model: "openai/gpt-4o-mini", effectiveModel: "openrouter/fallback", generationId: "enemy-run-1" }));
  });

  it("preserves provider failures on the local path", async () => {
    mocks.generateJson.mockRejectedValue(new AiProviderError("OpenRouter text generation failed. Too many requests", { status: 429, requestId: "enemy-request-1", retryAfter: "9" }));

    const response = await POST(request(baseInput));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("9");
    expect(payload).toMatchObject({ error: expect.stringContaining("Too many requests"), providerRequestId: "enemy-request-1" });
  });
});