import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  createCampaignArtSignedUrl: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/storage/campaign-art", () => ({ createCampaignArtSignedUrl: mocks.createCampaignArtSignedUrl }));

import { GET } from "@/app/api/ai/image/[generationRunId]/route";

const generationRunId = "00000000-0000-4000-8000-000000000003";
const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const imagePath = `${campaignId}/${userId}/image-${generationRunId}.png`;

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

describe("GET /api/ai/image/[generationRunId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(401);
  });

  it("reports a pending job without signing an image", async () => {
    const statusUpdatedAt = new Date(Date.now() - 1000).toISOString();
    const supabase = createSupabaseMock({ id: generationRunId, status: "pending", status_updated_at: statusUpdatedAt });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({ job: { generationRunId, status: "pending", statusUpdatedAt } });
    expect(mocks.createCampaignArtSignedUrl).not.toHaveBeenCalled();
  });

  it("turns an expired pending job into a terminal failure", async () => {
    const supabase = createSupabaseMock({ id: generationRunId, status: "pending", status_updated_at: "2020-01-01T00:00:00.000Z" });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      job: { generationRunId, status: "failed" },
      error: expect.stringContaining("background worker did not start"),
    });
    expect(mocks.createCampaignArtSignedUrl).not.toHaveBeenCalled();
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

  it("returns a safe failure status", async () => {
    const supabase = createSupabaseMock({ id: generationRunId, status: "failed", error_message: "Provider unavailable" });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ job: { generationRunId, status: "failed" }, error: "Provider unavailable" });
  });

  it("signs the private generated image only after completion", async () => {
    const supabase = createSupabaseMock({
      id: generationRunId,
      campaign_id: campaignId,
      requested_by: userId,
      kind: "image",
      mode: "refine",
      target_kind: "npc",
      aspect_ratio: "16:9",
      size: "3840x2160",
      model: "openai/gpt-image-1",
      effective_model: "openai/gpt-image-1",
      image_path: imagePath,
      image_media_type: "image/png",
      created_at: "2026-08-13T12:34:56+00:00",
      status_updated_at: "2026-08-13T12:34:56+00:00",
      status: "complete",
    });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.createCampaignArtSignedUrl.mockResolvedValue("https://storage.example/generated.png");

    const response = await GET(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createCampaignArtSignedUrl).toHaveBeenCalledWith(supabase, imagePath);
    expect(payload.job).toMatchObject({ generationRunId, status: "complete", targetKind: "npc", mode: "refine", temporaryPath: imagePath, image: { base64: null, url: "https://storage.example/generated.png", mediaType: "image/png" } });
  });
});