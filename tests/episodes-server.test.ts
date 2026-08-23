import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { getCampaignEpisode, getCampaignEpisodes } from "@/lib/campaign/episodes-server";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const episodeId = "00000000-0000-4000-8000-000000000003";
const authorId = "00000000-0000-4000-8000-000000000004";

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    not: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error });
  query.then.mockImplementation((onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data, error }).then(onFulfilled));
  return query;
}

const episode = {
  id: episodeId,
  campaign_id: campaignId,
  source_job_id: null,
  place_id: null,
  created_by: authorId,
  title: "The Relay",
  summary: "Recover the signal.",
  player_context_markdown: "The crew reaches the tower.",
  status: "active" as const,
  started_at: "2026-08-21T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z",
};

describe("campaign Episodes server reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without querying membership when the user is unauthenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const result = await getCampaignEpisodes(campaignId);

    expect(result).toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("counts only campaign-scoped notes visible to the member", async () => {
    const episodesQuery = createQuery([episode]);
    const notesQuery = createQuery([
      { episode_id: episodeId, visibility: "player" },
      { episode_id: episodeId, visibility: "gm" },
      { episode_id: "other-episode", visibility: "player" },
    ]);
    const supabase = { from: vi.fn().mockReturnValueOnce(episodesQuery).mockReturnValueOnce(notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const result = await getCampaignEpisodes(campaignId);

    expect(result?.episodes).toEqual([{ ...episode, noteCount: 1 }]);
    expect(episodesQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(notesQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });

  it("keeps GM-only episode notes out of player detail reads while scoping the episode", async () => {
    const episodeQuery = createQuery(episode);
    const notesQuery = createQuery([
      { id: "note-player", title: "Public log", body_markdown: "Visible.", visibility: "player", author_id: authorId, created_at: "", updated_at: "" },
      { id: "note-gm", title: "Private log", body_markdown: "Hidden.", visibility: "gm", author_id: authorId, created_at: "", updated_at: "" },
    ]);
    const profilesQuery = createQuery([{ id: authorId, display_name: "GM" }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(episodeQuery).mockReturnValueOnce(notesQuery).mockReturnValueOnce(profilesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const result = await getCampaignEpisode(campaignId, episodeId);

    expect(result?.episode).toMatchObject({ id: episodeId, noteCount: 1 });
    expect(result?.notes).toHaveLength(1);
    expect(result?.notes[0]).toMatchObject({ id: "note-player", author: { id: authorId, displayName: "GM" }, permissions: { canEdit: false, canDelete: false } });
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(1, "id", episodeId);
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("returns private notes and GM permissions for GM detail reads", async () => {
    const episodeQuery = createQuery(episode);
    const notesQuery = createQuery([{ id: "note-gm", title: "Private log", body_markdown: "Hidden.", visibility: "gm", author_id: userId, created_at: "", updated_at: "" }]);
    const profilesQuery = createQuery([{ id: userId, display_name: "Director" }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(episodeQuery).mockReturnValueOnce(notesQuery).mockReturnValueOnce(profilesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const result = await getCampaignEpisode(campaignId, episodeId);

    expect(result?.notes[0]).toMatchObject({ visibility: "gm", permissions: { canEdit: true, canDelete: true } });
  });
});