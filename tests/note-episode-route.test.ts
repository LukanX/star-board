import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { GET as listEpisodes } from "@/app/api/campaigns/[campaignId]/episodes/route";
import { DELETE as deleteEpisode, GET as getEpisode, PATCH as updateEpisode } from "@/app/api/campaigns/[campaignId]/episodes/[episodeId]/route";
import { GET as listNotes } from "@/app/api/campaigns/[campaignId]/notes/route";
import { GET as getNote } from "@/app/api/campaigns/[campaignId]/notes/[noteId]/route";
import { POST as createNote } from "@/app/api/campaigns/[campaignId]/notes/route";
import { DELETE as deleteNote, PATCH as updateNote } from "@/app/api/campaigns/[campaignId]/notes/[noteId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const episodeId = "00000000-0000-4000-8000-000000000003";
const noteId = "00000000-0000-4000-8000-000000000004";

type QueryResult = { data: unknown; error: unknown };
type Query = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (onFulfilled?: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

function createQuery(result: QueryResult): Query {
  const query = {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    not: vi.fn(),
    in: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  } as Query;

  query.insert.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return query;
}

function createSupabase(tables: Record<string, Query[]>) {
  const from = vi.fn((table: string) => {
    const query = tables[table]?.shift();
    if (!query) throw new Error(`Unexpected table query: ${table}`);
    return query;
  });

  return { supabase: { from }, from };
}

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/campaigns", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function campaignParams() {
  return { params: Promise.resolve({ campaignId }) };
}

function episodeParams() {
  return { params: Promise.resolve({ campaignId, episodeId }) };
}

function noteParams() {
  return { params: Promise.resolve({ campaignId, noteId }) };
}

describe("notes and episode routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
  });

  it("creates a note assigned to an episode in the same campaign", async () => {
    const episodeQuery = createQuery({ data: { id: episodeId }, error: null });
    const note = { id: noteId, campaign_id: campaignId, episode_id: episodeId, author_id: userId, title: "Relay log", body_markdown: "The signal repeats.", visibility: "player" };
    const noteQuery = createQuery({ data: note, error: null });
    const { supabase } = createSupabase({ episodes: [episodeQuery], campaign_notes: [noteQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await createNote(request({ title: " Relay log ", bodyMarkdown: "The signal repeats.", episodeId }), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.note).toMatchObject({ id: noteId, episode_id: episodeId, author: { id: userId, displayName: "Pilot" } });
    expect(noteQuery.insert).toHaveBeenCalledWith({
      campaign_id: campaignId,
      episode_id: episodeId,
      author_id: userId,
      title: "Relay log",
      body_markdown: "The signal repeats.",
      visibility: "player",
      updated_by: userId,
    });
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(1, "id", episodeId);
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("rejects a note episode from another campaign", async () => {
    const episodeQuery = createQuery({ data: null, error: null });
    const { supabase, from } = createSupabase({ episodes: [episodeQuery], campaign_notes: [] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await createNote(request({ title: "Wrong episode", episodeId }), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Note episode must belong to this campaign.");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("clears an episode assignment without changing other note fields", async () => {
    const existingNoteQuery = createQuery({ data: { id: noteId, author_id: userId, visibility: "player" }, error: null });
    const noteQuery = createQuery({ data: { id: noteId, campaign_id: campaignId, episode_id: null, author_id: userId, title: "Global log", body_markdown: "", visibility: "player" }, error: null });
    const profileQuery = createQuery({ data: { id: userId, display_name: "Pilot" }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [existingNoteQuery, noteQuery], profiles: [profileQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateNote(request({ episodeId: null }, "PATCH"), noteParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.note).toMatchObject({ id: noteId, episode_id: null, permissions: { canEdit: true, canDelete: true } });
    expect(noteQuery.update).toHaveBeenCalledWith({ episode_id: null, updated_by: userId });
    expect(noteQuery.eq).toHaveBeenNthCalledWith(1, "id", noteId);
    expect(noteQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("rejects a player from updating another player's note", async () => {
    const noteQuery = createQuery({ data: { id: noteId, author_id: "00000000-0000-4000-8000-000000000005", visibility: "player" }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [noteQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateNote(request({ title: "Tampered log" }, "PATCH"), noteParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Note author or GM access is required.");
    expect(noteQuery.update).not.toHaveBeenCalled();
  });

  it("rejects a player from deleting another player's note", async () => {
    const noteQuery = createQuery({ data: { id: noteId, author_id: "00000000-0000-4000-8000-000000000005", visibility: "player" }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [noteQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await deleteNote(new Request("http://localhost", { method: "DELETE" }), noteParams());
    const payload = await response.json().catch(() => ({}));

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Note author or GM access is required.");
    expect(noteQuery.delete).not.toHaveBeenCalled();
  });

  it("allows a GM to update a player-authored note", async () => {
    const existingNoteQuery = createQuery({ data: { id: noteId, author_id: "00000000-0000-4000-8000-000000000005", visibility: "player" }, error: null });
    const noteQuery = createQuery({ data: { id: noteId, campaign_id: campaignId, episode_id: null, author_id: "00000000-0000-4000-8000-000000000005", title: "Updated log", body_markdown: "", visibility: "player" }, error: null });
    const profileQuery = createQuery({ data: { id: "00000000-0000-4000-8000-000000000005", display_name: "Archivist" }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [existingNoteQuery, noteQuery], profiles: [profileQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const response = await updateNote(request({ title: "Updated log" }, "PATCH"), noteParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.note).toMatchObject({ id: noteId, title: "Updated log", permissions: { canEdit: true, canDelete: true } });
    expect(noteQuery.update).toHaveBeenCalledWith({ title: "Updated log", updated_by: userId });
  });

  it("allows a GM to delete a player-authored note", async () => {
    const existingNoteQuery = createQuery({ data: { id: noteId, author_id: "00000000-0000-4000-8000-000000000005", visibility: "player" }, error: null });
    const deleteQuery = createQuery({ data: { id: noteId }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [existingNoteQuery, deleteQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const response = await deleteNote(new Request("http://localhost", { method: "DELETE" }), noteParams());

    expect(response.status).toBe(204);
    expect(deleteQuery.delete).toHaveBeenCalled();
  });

  it("rejects a player from changing their own note to GM-only visibility", async () => {
    const noteQuery = createQuery({ data: { id: noteId, author_id: userId, visibility: "player" }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [noteQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateNote(request({ visibility: "gm" }, "PATCH"), noteParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required for private notes.");
    expect(noteQuery.update).not.toHaveBeenCalled();
  });

  it("reports campaign-scoped episode note counts", async () => {
    const episodeQuery = createQuery({ data: [{ id: episodeId, title: "Relay", status: "active" }], error: null });
    const notesQuery = createQuery({ data: [{ episode_id: episodeId, visibility: "player" }, { episode_id: episodeId, visibility: "gm" }, { episode_id: null, visibility: "player" }], error: null });
    const { supabase } = createSupabase({ episodes: [episodeQuery], campaign_notes: [notesQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await listEpisodes(new Request("http://localhost"), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.episodes).toEqual([{ id: episodeId, title: "Relay", status: "active", noteCount: 1 }]);
    expect(notesQuery.not).toHaveBeenCalledWith("episode_id", "is", null);
  });

  it("does not return GM-only episode notes to players", async () => {
    const episodeQuery = createQuery({ data: { id: episodeId, campaign_id: campaignId, title: "Relay", status: "active" }, error: null });
    const notesQuery = createQuery({ data: [
      { id: "player-note", title: "Public log", body_markdown: "Visible.", visibility: "player", author_id: userId },
      { id: "gm-note", title: "Private log", body_markdown: "Hidden.", visibility: "gm", author_id: userId },
    ], error: null });
    const profileQuery = createQuery({ data: [{ id: userId, display_name: "Pilot" }], error: null });
    const { supabase } = createSupabase({ episodes: [episodeQuery], campaign_notes: [notesQuery], profiles: [profileQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await getEpisode(new Request("http://localhost"), episodeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.notes).toEqual([expect.objectContaining({ id: "player-note" })]);
    expect(payload.notes).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "gm-note" })]));
    expect(payload.episode.noteCount).toBe(1);
  });

  it("does not return GM-only campaign notes in player list reads", async () => {
    const notesQuery = createQuery({ data: [
      { id: "player-note", campaign_id: campaignId, episode_id: null, author_id: userId, title: "Public log", body_markdown: "Visible.", visibility: "player" },
      { id: "gm-note", campaign_id: campaignId, episode_id: null, author_id: userId, title: "Private log", body_markdown: "Hidden.", visibility: "gm" },
    ], error: null });
    const profileQuery = createQuery({ data: [{ id: userId, display_name: "Pilot" }], error: null });
    const { supabase } = createSupabase({ campaign_notes: [notesQuery], profiles: [profileQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await listNotes(new Request("http://localhost"), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.notes).toEqual([expect.objectContaining({ id: "player-note" })]);
    expect(payload.notes).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "gm-note" })]));
  });

  it("does not reveal a GM-only campaign note to players by id", async () => {
    const notesQuery = createQuery({ data: { id: noteId, campaign_id: campaignId, episode_id: null, author_id: userId, title: "Private log", body_markdown: "Hidden.", visibility: "gm" }, error: null });
    const { supabase, from } = createSupabase({ campaign_notes: [notesQuery], profiles: [] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await getNote(new Request("http://localhost"), noteParams());
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Campaign note not found.");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("returns episode notes with author and owner permissions", async () => {
    const episodeQuery = createQuery({ data: { id: episodeId, campaign_id: campaignId, title: "Relay", status: "active" }, error: null });
    const notesQuery = createQuery({ data: [{ id: noteId, title: "Relay log", body_markdown: "The signal repeats.", visibility: "player", author_id: userId }], error: null });
    const profileQuery = createQuery({ data: [{ id: userId, display_name: "Pilot" }], error: null });
    const { supabase } = createSupabase({ episodes: [episodeQuery], campaign_notes: [notesQuery], profiles: [profileQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await getEpisode(new Request("http://localhost"), episodeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.episode).toMatchObject({ id: episodeId, noteCount: 1 });
    expect(payload.notes[0]).toMatchObject({ id: noteId, author: { id: userId, displayName: "Pilot" }, permissions: { canEdit: true, canDelete: true } });
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(1, "campaign_id", campaignId);
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(2, "id", episodeId);
  });

  it("allows a GM to update episode fields and validates the primary place", async () => {
    const placeQuery = createQuery({ data: { id: "00000000-0000-4000-8000-000000000005" }, error: null });
    const updatedEpisode = { id: episodeId, campaign_id: campaignId, source_job_id: null, place_id: "00000000-0000-4000-8000-000000000005", created_by: userId, title: "The Relay Returns", summary: "Recover the signal again.", player_context_markdown: "The tower wakes.", status: "complete", started_at: "2026-08-21T00:00:00.000Z", completed_at: "2026-08-22T00:00:00.000Z", created_at: "2026-08-21T00:00:00.000Z", updated_at: "2026-08-22T00:00:00.000Z" };
    const episodeQuery = createQuery({ data: updatedEpisode, error: null });
    const { supabase } = createSupabase({ places: [placeQuery], episodes: [episodeQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const response = await updateEpisode(request({
      title: "The Relay Returns",
      summary: "Recover the signal again.",
      playerContextMarkdown: "The tower wakes.",
      status: "complete",
      startedAt: "2026-08-21",
      completedAt: "2026-08-22",
      placeId: "00000000-0000-4000-8000-000000000005",
    }, "PATCH"), episodeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.episode).toMatchObject({ id: episodeId, title: "The Relay Returns", status: "complete" });
    expect(placeQuery.eq).toHaveBeenNthCalledWith(1, "id", "00000000-0000-4000-8000-000000000005");
    expect(placeQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
    expect(episodeQuery.update).toHaveBeenCalledWith({
      title: "The Relay Returns",
      summary: "Recover the signal again.",
      player_context_markdown: "The tower wakes.",
      status: "complete",
      started_at: "2026-08-21T00:00:00.000Z",
      completed_at: "2026-08-22T00:00:00.000Z",
      place_id: "00000000-0000-4000-8000-000000000005",
      updated_by: userId,
    });
  });

  it("rejects players from updating episodes", async () => {
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const response = await updateEpisode(request({ title: "Nope" }, "PATCH"), episodeParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required.");
  });

  it("rejects an episode completion date before its start date", async () => {
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const response = await updateEpisode(request({ startedAt: "2026-08-22", completedAt: "2026-08-21" }, "PATCH"), episodeParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Episode details are invalid.");
  });

  it("allows a GM to delete an episode without reopening its source job", async () => {
    const episodeQuery = createQuery({ data: { id: episodeId }, error: null });
    const { supabase } = createSupabase({ episodes: [episodeQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });

    const response = await deleteEpisode(new Request("http://localhost", { method: "DELETE" }), episodeParams());

    expect(response.status).toBe(204);
    expect(episodeQuery.delete).toHaveBeenCalled();
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(1, "id", episodeId);
    expect(episodeQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("rejects players from deleting episodes", async () => {
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const response = await deleteEpisode(new Request("http://localhost", { method: "DELETE" }), episodeParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required.");
  });
});