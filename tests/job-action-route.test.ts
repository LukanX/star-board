import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));

import { POST as promoteJob } from "@/app/api/campaigns/[campaignId]/jobs/[jobId]/promote/route";
import { DELETE as removeVote, POST as castVote } from "@/app/api/campaigns/[campaignId]/jobs/[jobId]/vote/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const episodeId = "00000000-0000-4000-8000-000000000003";

function params() {
  return { params: Promise.resolve({ campaignId, jobId }) };
}

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("job action routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before casting a vote", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await castVote(new Request("http://localhost", { method: "POST" }), params());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication is required.");
  });

  it("casts and removes votes through campaign-scoped RPCs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { campaign_id: campaignId, job_id: jobId }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const supabase = { rpc };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-id" } });

    const castResponse = await castVote(new Request("http://localhost", { method: "POST" }), params());
    const castPayload = await castResponse.json();
    const removeResponse = await removeVote(new Request("http://localhost", { method: "DELETE" }), params());

    expect(castResponse.status).toBe(200);
    expect(castPayload.vote).toEqual({ campaign_id: campaignId, job_id: jobId });
    expect(removeResponse.status).toBe(204);
    expect(rpc).toHaveBeenNthCalledWith(1, "cast_job_vote", { target_campaign_id: campaignId, target_job_id: jobId });
    expect(rpc).toHaveBeenNthCalledWith(2, "clear_job_vote", { target_campaign_id: campaignId });
  });

  it("maps a failed vote RPC to the player/open-job error", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("not allowed") }) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-id" } });

    const response = await castVote(new Request("http://localhost", { method: "POST" }), params());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Only players can vote on an open job in this campaign.");
  });

  it("returns the newly created episode after campaign-scoped promotion", async () => {
    const episode = { id: episodeId, title: "Relay", status: "planned", source_job_id: jobId, place_id: "00000000-0000-4000-8000-000000000004" };
    const episodeQuery = createQuery(episode);
    const rpc = vi.fn().mockResolvedValue({ data: episodeId, error: null });
    const supabase = { rpc, from: vi.fn().mockReturnValue(episodeQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "gm-id" } });

    const response = await promoteJob(new Request("http://localhost", { method: "POST" }), params());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.episode).toEqual(episode);
    expect(rpc).toHaveBeenCalledWith("promote_job_to_episode", { target_campaign_id: campaignId, target_job_id: jobId });
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(1, "id", episodeId);
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });
});