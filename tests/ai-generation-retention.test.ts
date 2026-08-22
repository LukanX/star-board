import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { config } from "@/netlify/functions/ai-generation-retention";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient,
}));

describe("AI generation retention schedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T03:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes audit rows older than 90 days on the daily schedule", async () => {
    const lt = vi.fn().mockResolvedValue({ error: null, count: 2 });
    const deleteRows = vi.fn().mockReturnValue({ lt });
    const from = vi.fn().mockReturnValue({ delete: deleteRows });
    mocks.getSupabaseServiceRoleClient.mockReturnValue({ from });

    await handler(new Request("https://star-board.test/.netlify/functions/ai-generation-retention", { method: "POST" }));

    expect(config).toEqual({ schedule: "0 3 * * *" });
    expect(from).toHaveBeenCalledWith("ai_generation_runs");
    expect(deleteRows).toHaveBeenCalledWith({ count: "exact" });
    expect(lt).toHaveBeenCalledWith("created_at", "2026-05-24T03:00:00.000Z");
  });
});