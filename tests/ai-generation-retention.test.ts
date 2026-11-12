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
    vi.clearAllMocks();
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
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) })
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

  it("retries bounded durable cleanup and retains receipts for still-referenced or failed objects", async () => {
    const cleanupRows = [
      { campaign_id: "campaign-1", path: "campaign-1/user-1/studio-deleted.png" },
      { campaign_id: "campaign-1", path: "campaign-1/user-1/character-retained.png" },
    ];
    const limit = vi.fn().mockResolvedValue({ data: cleanupRows, error: null });
    const receipt = { eq: vi.fn() };
    receipt.eq.mockReturnValueOnce(receipt).mockResolvedValueOnce({ error: null });
    const clearReceipt = vi.fn().mockReturnValue(receipt);
    const cleanup = { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit }) }), delete: clearReceipt };
    const audit = {
      select: vi.fn().mockReturnValue({ lt: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      delete: vi.fn().mockReturnValue({ lt: vi.fn().mockResolvedValue({ count: 0, error: null }) }),
    };
    const client = { from: vi.fn((table: string) => table === "campaign_art_cleanup" ? cleanup : audit) };
    mocks.getSupabaseServiceRoleClient.mockReturnValue(client);
    mocks.removeCampaignArtIfUnreferenced.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await handler(new Request("https://star-board.test/.netlify/functions/ai-generation-retention", { method: "POST" }));
    expect(limit).toHaveBeenCalledWith(100);
    expect(mocks.removeCampaignArtIfUnreferenced).toHaveBeenCalledTimes(2);
    expect(clearReceipt).toHaveBeenCalledTimes(1);
    expect(receipt.eq).toHaveBeenCalledWith("path", cleanupRows[0].path);
    expect(receipt.eq).not.toHaveBeenCalledWith("path", cleanupRows[1].path);
  });
});