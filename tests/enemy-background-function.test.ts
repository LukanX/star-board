import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnemyBackgroundSignature } from "@/lib/ai/enemy-jobs";
import { enemyJobPendingTimeoutMs, enemyJobProviderTimeoutMs } from "@/lib/ai/enemy-job-lifecycle";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getServerEnv: vi.fn(),
  getSupabaseServiceRoleClient: vi.fn(),
  getAiProviderFailure: vi.fn(),
  logAiProviderFailure: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({ generateJson: mocks.generateJson }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/supabase/service", () => ({ getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient }));
vi.mock("@/lib/ai/errors", () => ({ getAiProviderFailure: mocks.getAiProviderFailure, logAiProviderFailure: mocks.logAiProviderFailure }));

import handler, { config } from "@/netlify/functions/generate-enemy-background";

const secret = "worker-secret";
const generationRunId = "00000000-0000-4000-8000-000000000003";
const job = {
  generationRunId,
  prompt: "A complete enemy stat block",
  model: "openai/gpt-4o-mini",
};

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

function createQuery(result: { data?: unknown; error?: Error | null }) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function createSupabaseMock(options: {
  claim?: { data?: unknown; error?: Error | null };
  completion?: { data?: unknown; error?: Error | null };
  failure?: { data?: unknown; error?: Error | null };
} = {}) {
  const claimQuery = createQuery(options.claim ?? {
    data: { id: generationRunId, campaign_id: "00000000-0000-4000-8000-000000000001", requested_by: "00000000-0000-4000-8000-000000000002" },
  });
  const completionQuery = createQuery(options.completion ?? { data: { id: generationRunId } });
  const failureQuery = createQuery(options.failure ?? { data: { id: generationRunId } });
  const supabase = {
    from: vi.fn().mockReturnValueOnce(claimQuery).mockReturnValueOnce(completionQuery).mockReturnValue(failureQuery),
  };

  return { supabase, claimQuery, completionQuery, failureQuery };
}

function createRequest() {
  return new Request("https://star-board.test/.netlify/functions/generate-enemy-background", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Star-Board-Enemy-Signature": createEnemyBackgroundSignature(job, secret),
    },
    body: JSON.stringify(job),
  });
}

describe("generate-enemy-background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ SUPABASE_SECRET_KEY: secret, NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example", OPENROUTER_API_KEY: "test-key" });
    mocks.getAiProviderFailure.mockImplementation((error: unknown, fallback: string) => ({ message: error instanceof Error ? error.message : fallback }));
    mocks.generateJson.mockResolvedValue({ data: draft, model: "openrouter/fallback", generationId: "enemy-provider-run", usage: { inputTokens: 12, outputTokens: 34, cost: 0.001 } });
  });

  it("declares an explicit Netlify background function", () => {
    expect(config).toEqual({ background: true });
  });

  it("rejects malformed jobs before accessing the provider or database", async () => {
    const response = await handler(new Request("https://star-board.test/.netlify/functions/generate-enemy-background", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));

    expect(response.status).toBe(400);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid dispatch signature", async () => {
    const request = createRequest();
    request.headers.set("X-Star-Board-Enemy-Signature", "0".repeat(64));

    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(mocks.getSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("claims, generates, validates, and completes a job", async () => {
    const { supabase, claimQuery, completionQuery } = createSupabaseMock();
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(claimQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running", status_updated_at: expect.any(String), draft: null }));
    expect(claimQuery.gte).toHaveBeenCalledWith("status_updated_at", expect.any(String));
    expect(mocks.generateJson).toHaveBeenCalledWith(job.prompt, expect.anything(), job.model, { timeoutMs: enemyJobProviderTimeoutMs });
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", status_updated_at: expect.any(String), draft }));
  });

  it("marks provider and validation failures as terminal failures", async () => {
    const { supabase, completionQuery } = createSupabaseMock();
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    mocks.generateJson.mockRejectedValue(new Error("OpenRouter timed out"));

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", status_updated_at: expect.any(String), error_message: "OpenRouter timed out", draft: null }));
    expect(mocks.logAiProviderFailure).toHaveBeenCalled();
  });

  it("does not start a job that was already claimed or missed its pending deadline", async () => {
    const { supabase } = createSupabaseMock({ claim: { data: null } });
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(enemyJobPendingTimeoutMs).toBe(4 * 60 * 1000);
  });
});