import { beforeEach, describe, expect, it, vi } from "vitest";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const mocks = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn() }));

vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));

import { GET } from "@/app/api/ai/enemy/[generationRunId]/route";

const generationRunId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000002";

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

function createSupabaseMock(run: Record<string, unknown> | null, error: Error | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: run, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { from: vi.fn(() => query) };
}

function params() {
  return { params: Promise.resolve({ generationRunId }) };
}

describe("GET /api/ai/enemy/[generationRunId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(401);
  });

  it("reports a pending job without returning a draft", async () => {
    const statusUpdatedAt = new Date(Date.now() - 1000).toISOString();
    const supabase = createSupabaseMock({ id: generationRunId, status: "pending", status_updated_at: statusUpdatedAt, draft: null });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({ job: { generationRunId, status: "pending", statusUpdatedAt } });
  });

  it("turns an expired running job into a terminal failure", async () => {
    const supabase = createSupabaseMock({ id: generationRunId, status: "running", status_updated_at: "2020-01-01T00:00:00.000Z" });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      job: { generationRunId, status: "failed" },
      error: expect.stringContaining("worker time limit"),
    });
  });

  it("returns a safe terminal failure", async () => {
    const supabase = createSupabaseMock({ id: generationRunId, status: "failed", error_message: "Provider unavailable" });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ job: { generationRunId, status: "failed" }, error: "Provider unavailable" });
  });

  it("returns only a validated draft after completion", async () => {
    const supabase = createSupabaseMock({
      id: generationRunId,
      kind: "enemy",
      mode: "create",
      model: "openai/gpt-4o-mini",
      effective_model: "openrouter/fallback",
      created_at: "2026-08-27T12:00:00.000Z",
      status_updated_at: "2026-08-27T12:01:00.000Z",
      status: "complete",
      draft,
    });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.job).toEqual({
      generationRunId,
      status: "complete",
      mode: "create",
      model: "openrouter/fallback",
      createdAt: "2026-08-27T12:00:00.000Z",
      statusUpdatedAt: "2026-08-27T12:01:00.000Z",
      draft,
    });
  });

  it("rejects a completed run with an invalid persisted draft", async () => {
    const supabase = createSupabaseMock({ id: generationRunId, status: "complete", draft: { name: "Incomplete" } });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("no valid draft");
  });
});