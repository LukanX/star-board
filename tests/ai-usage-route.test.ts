import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCampaignGM: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));

import { GET } from "@/app/api/campaigns/[campaignId]/ai-usage/route";
import { rollingSevenDaysMs } from "@/lib/time";

const campaignId = "00000000-0000-4000-8000-000000000001";

function params() {
  return { params: Promise.resolve({ campaignId }) };
}

describe("GET /api/campaigns/[campaignId]/ai-usage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires GM access", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required to view AI usage.");
  });

  it("sums input and output tokens from the rolling last seven days", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gte.mockResolvedValue({ data: [{ input_tokens: 120, output_tokens: 80 }, { input_tokens: null, output_tokens: 50 }], error: null });
    const supabase = { from: vi.fn(() => query) };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "user-id" }, role: "gm" });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ inputTokens: 120, outputTokens: 130, totalTokens: 250 });
    expect(supabase.from).toHaveBeenCalledWith("ai_generation_runs");
    expect(query.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(query.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    const periodStart = new Date(query.gte.mock.calls[0][1] as string).getTime();
    expect(Date.now() - periodStart).toBeGreaterThanOrEqual(rollingSevenDaysMs - 1000);
    expect(Date.now() - periodStart).toBeLessThan(rollingSevenDaysMs + 1000);
  });

  it("returns a service error when usage cannot be read", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gte.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    const supabase = { from: vi.fn(() => query) };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "user-id" }, role: "gm" });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Campaign AI usage could not be loaded.");
  });
});