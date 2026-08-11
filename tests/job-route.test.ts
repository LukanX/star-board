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

import { GET as listJobs } from "@/app/api/campaigns/[campaignId]/jobs/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function params() {
  return { params: Promise.resolve({ campaignId }) };
}

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data, error });
  query.in.mockResolvedValue({ data, error });
  query.then.mockImplementation((onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data, error }).then(onFulfilled));
  return query;
}

describe("job list privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: null })));
  });

  it("does not expose GM hooks to players", async () => {
    const job = { id: "00000000-0000-4000-8000-000000000003", title: "The Relay", summary: "Recover a lost signal.", player_notes_markdown: "A public brief.", giver_npc_id: "00000000-0000-4000-8000-000000000004", giver_faction_id: null, status: "open", hook: "The signal is bait.", art_subject: null, art_path: null, art_prompt: null, art_provider: null };
    const jobsQuery = createQuery([job]);
    const votesQuery = createQuery([]);
    const npcsQuery = createQuery([{ id: job.giver_npc_id, name: "Mira" }]);
    const factionsQuery = createQuery([]);
    const supabase = { from: vi.fn().mockReturnValueOnce(jobsQuery).mockReturnValueOnce(votesQuery).mockReturnValueOnce(npcsQuery).mockReturnValueOnce(factionsQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Player" });

    const response = await listJobs(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.jobs[0]).not.toHaveProperty("hook");
    expect(payload.jobs[0].giver).toEqual({ type: "NPC", id: job.giver_npc_id, name: "Mira" });
  });

  it("keeps hooks available to GMs", async () => {
    const job = { id: "00000000-0000-4000-8000-000000000003", title: "The Relay", summary: "Recover a lost signal.", player_notes_markdown: "A public brief.", giver_npc_id: "00000000-0000-4000-8000-000000000004", giver_faction_id: null, status: "open", hook: "The signal is bait.", art_subject: null, art_path: null, art_prompt: null, art_provider: null };
    const jobsQuery = createQuery([job]);
    const votesQuery = createQuery([]);
    const npcsQuery = createQuery([{ id: job.giver_npc_id, name: "Mira" }]);
    const factionsQuery = createQuery([]);
    const notesQuery = createQuery([{ job_id: job.id, body_markdown: "Private context." }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(jobsQuery).mockReturnValueOnce(votesQuery).mockReturnValueOnce(npcsQuery).mockReturnValueOnce(factionsQuery).mockReturnValueOnce(notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });

    const response = await listJobs(new Request("http://localhost"), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.jobs[0]).toMatchObject({ hook: "The signal is bait.", gm_notes_markdown: "Private context." });
  });
});