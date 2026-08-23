import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { getCampaignNote, getCampaignNotes } from "@/lib/campaign/notes-server";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const authorId = "00000000-0000-4000-8000-000000000003";
const noteId = "00000000-0000-4000-8000-000000000004";

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

const note = {
  id: noteId,
  campaign_id: campaignId,
  episode_id: null,
  author_id: authorId,
  title: "Relay log",
  body_markdown: "The signal repeats.",
  visibility: "player" as const,
  created_at: "2026-08-21T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z",
  updated_by: authorId,
};

describe("campaign Notes server reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without querying membership when the user is unauthenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const result = await getCampaignNotes(campaignId);

    expect(result).toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("keeps GM-only notes out of player list reads while preserving author permissions", async () => {
    const notesQuery = createQuery([
      note,
      { ...note, id: "gm-note", title: "Private log", body_markdown: "Hidden.", visibility: "gm" },
    ]);
    const profilesQuery = createQuery([{ id: authorId, display_name: "Archivist" }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(notesQuery).mockReturnValueOnce(profilesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const result = await getCampaignNotes(campaignId);

    expect(result?.notes).toHaveLength(1);
    expect(result?.notes[0]).toMatchObject({ id: noteId, author: { id: authorId, displayName: "Archivist" }, permissions: { canEdit: false, canDelete: false } });
    expect(result?.notes).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "gm-note" })]));
    expect(notesQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });

  it("returns GM-only notes to GMs with GM permissions", async () => {
    const notesQuery = createQuery([{ ...note, visibility: "gm" }]);
    const profilesQuery = createQuery([{ id: authorId, display_name: "Archivist" }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(notesQuery).mockReturnValueOnce(profilesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const result = await getCampaignNotes(campaignId);

    expect(result?.notes[0]).toMatchObject({ visibility: "gm", permissions: { canEdit: true, canDelete: true } });
  });

  it("preserves edit and delete permissions for the author of a player note", async () => {
    const notesQuery = createQuery([note]);
    const profilesQuery = createQuery([{ id: authorId, display_name: "Archivist" }]);
    const supabase = { from: vi.fn().mockReturnValueOnce(notesQuery).mockReturnValueOnce(profilesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: authorId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Archivist" });

    const result = await getCampaignNotes(campaignId);

    expect(result?.notes[0].permissions).toEqual({ canEdit: true, canDelete: true });
  });

  it("scopes detail reads to both note and campaign and hides private notes from players", async () => {
    const notesQuery = createQuery({ ...note, visibility: "gm" });
    const supabase = { from: vi.fn().mockReturnValueOnce(notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const result = await getCampaignNote(campaignId, noteId);

    expect(result).toBeNull();
    expect(notesQuery.eq).toHaveBeenNthCalledWith(1, "id", noteId);
    expect(notesQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});