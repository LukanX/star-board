import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  addCampaignArtUrls: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));
vi.mock("@/lib/storage/campaign-art", () => ({ addCampaignArtUrls: mocks.addCampaignArtUrls }));

import { getCampaignJob, getCampaignJobs } from "@/lib/campaign/jobs-server";

const campaignId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error });
  query.then.mockImplementation((onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data, error }).then(onFulfilled));
  return query;
}

const job = {
  id: jobId,
  campaign_id: campaignId,
  title: "The Relay",
  summary: "Recover a lost signal.",
  player_notes_markdown: "A public brief.",
  giver_npc_id: "00000000-0000-4000-8000-000000000004",
  giver_faction_id: null,
  place_id: "00000000-0000-4000-8000-000000000005",
  status: "open" as const,
  hook: "The signal is bait.",
  art_subject: "A storm-lit relay tower",
  art_path: "campaigns/example/jobs/relay.png",
  art_prompt: "A storm-lit relay tower",
  art_provider: "openrouter",
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z",
};

describe("campaign Jobs server reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: "https://signed.example/relay.png" })));
  });

  it("returns null without querying when the user is unauthenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const result = await getCampaignJobs(campaignId);

    expect(result).toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("keeps private job fields out of player reads while preserving votes, giver, and art", async () => {
    const jobsQuery = createQuery([job]);
    const votesQuery = createQuery([{ job_id: jobId, user_id: userId }, { job_id: jobId, user_id: "other-user" }]);
    const npcsQuery = createQuery([{ id: job.giver_npc_id, name: "Mira" }]);
    const factionsQuery = createQuery([]);
    const supabase = { from: vi.fn().mockReturnValueOnce(jobsQuery).mockReturnValueOnce(votesQuery).mockReturnValueOnce(npcsQuery).mockReturnValueOnce(factionsQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Player" });

    const result = await getCampaignJobs(campaignId);

    expect(result).toMatchObject({ role: "player", displayName: "Player" });
    expect(result?.jobs[0]).toMatchObject({
      id: jobId,
      votes: 2,
      voted: true,
      giver: { type: "NPC", id: job.giver_npc_id, name: "Mira" },
      art_url: "https://signed.example/relay.png",
    });
    expect(result?.jobs[0]).not.toHaveProperty("hook");
    expect(result?.jobs[0]).not.toHaveProperty("gm_notes_markdown");
  });

  it("adds GM notes to GM reads and scopes detail queries to both campaign and job", async () => {
    const jobsQuery = createQuery([job]);
    const votesQuery = createQuery([]);
    const npcsQuery = createQuery([{ id: job.giver_npc_id, name: "Mira" }]);
    const factionsQuery = createQuery([]);
    const notesQuery = createQuery([{ job_id: jobId, body_markdown: "Private context." }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(jobsQuery).mockReturnValueOnce(votesQuery).mockReturnValueOnce(npcsQuery).mockReturnValueOnce(factionsQuery).mockReturnValueOnce(notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });

    const listResult = await getCampaignJobs(campaignId);

    expect(listResult?.jobs[0]).toMatchObject({ hook: job.hook, gm_notes_markdown: "Private context." });

    const detailJobsQuery = createQuery(job);
    const detailVotesQuery = createQuery([]);
    const detailNpcsQuery = createQuery([{ id: job.giver_npc_id, name: "Mira" }]);
    const detailFactionsQuery = createQuery([]);
    const detailNotesQuery = createQuery({ body_markdown: "Private context." });
    const detailSupabase = { from: vi.fn().mockReturnValueOnce(detailJobsQuery).mockReturnValueOnce(detailVotesQuery).mockReturnValueOnce(detailNpcsQuery).mockReturnValueOnce(detailFactionsQuery).mockReturnValueOnce(detailNotesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: detailSupabase, user: { id: userId } });

    const detailResult = await getCampaignJob(campaignId, jobId);

    expect(detailResult?.job.id).toBe(jobId);
    expect(detailJobsQuery.eq).toHaveBeenNthCalledWith(1, "id", jobId);
    expect(detailJobsQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });
});