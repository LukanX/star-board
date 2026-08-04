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
import { GET as getEpisode } from "@/app/api/campaigns/[campaignId]/episodes/[episodeId]/route";
import { POST as createNote } from "@/app/api/campaigns/[campaignId]/notes/route";
import { PATCH as updateNote } from "@/app/api/campaigns/[campaignId]/notes/[noteId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const episodeId = "00000000-0000-4000-8000-000000000003";
const noteId = "00000000-0000-4000-8000-000000000004";

type QueryResult = { data: unknown; error: unknown };
type Query = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
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
    const noteQuery = createQuery({ data: { id: noteId, campaign_id: campaignId, episode_id: null, author_id: userId, title: "Global log", body_markdown: "", visibility: "player" }, error: null });
    const profileQuery = createQuery({ data: { id: userId, display_name: "Pilot" }, error: null });
    const { supabase } = createSupabase({ campaign_notes: [noteQuery], profiles: [profileQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateNote(request({ episodeId: null }, "PATCH"), noteParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.note).toMatchObject({ id: noteId, episode_id: null, permissions: { canEdit: true, canDelete: true } });
    expect(noteQuery.update).toHaveBeenCalledWith({ episode_id: null, updated_by: userId });
    expect(noteQuery.eq).toHaveBeenNthCalledWith(1, "id", noteId);
    expect(noteQuery.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("reports campaign-scoped episode note counts", async () => {
    const episodeQuery = createQuery({ data: [{ id: episodeId, title: "Relay", status: "active" }], error: null });
    const notesQuery = createQuery({ data: [{ episode_id: episodeId }, { episode_id: episodeId }, { episode_id: null }], error: null });
    const { supabase } = createSupabase({ episodes: [episodeQuery], campaign_notes: [notesQuery] });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await listEpisodes(new Request("http://localhost"), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.episodes).toEqual([{ id: episodeId, title: "Relay", status: "active", noteCount: 2 }]);
    expect(notesQuery.not).toHaveBeenCalledWith("episode_id", "is", null);
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
});