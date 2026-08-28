import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { config } from "@/netlify/functions/ai-generation-retention";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceRoleClient: vi.fn(),
  removeCampaignArtIfUnreferenced: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient,
}));
vi.mock("@/lib/storage/campaign-art", () => ({
  removeCampaignArtIfUnreferenced: mocks.removeCampaignArtIfUnreferenced,
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
    const readLt = vi.fn().mockResolvedValue({ error: null, data: [
      { campaign_id: "campaign-1", image_path: "campaign-1/user-1/image-run-1.png" },
      { campaign_id: "campaign-1", image_path: null },
    ] });
    const deleteLt = vi.fn().mockResolvedValue({ error: null, count: 2 });
    const deleteRows = vi.fn().mockReturnValue({ lt: deleteLt });
    const from = vi.fn()
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ lt: readLt }) })
      .mockReturnValueOnce({ delete: deleteRows });
    mocks.removeCampaignArtIfUnreferenced.mockResolvedValue(true);
    mocks.getSupabaseServiceRoleClient.mockReturnValue({ from });

    await handler(new Request("https://star-board.test/.netlify/functions/ai-generation-retention", { method: "POST" }));

    expect(config).toEqual({ schedule: "0 3 * * *" });
    expect(from).toHaveBeenCalledWith("ai_generation_runs");
    expect(deleteRows).toHaveBeenCalledWith({ count: "exact" });
    expect(readLt).toHaveBeenCalledWith("created_at", "2026-05-24T03:00:00.000Z");
    expect(deleteLt).toHaveBeenCalledWith("created_at", "2026-05-24T03:00:00.000Z");
    expect(mocks.removeCampaignArtIfUnreferenced).toHaveBeenCalledWith(
      expect.anything(),
      "campaign-1",
      "campaign-1/user-1/image-run-1.png",
    );
  });
});