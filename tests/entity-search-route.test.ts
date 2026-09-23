import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { GET } from "@/app/api/campaigns/[campaignId]/entities/search/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const noteId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function queryFor(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.ilike.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.then.mockImplementation((onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(onFulfilled),
  );
  return query;
}

function createSupabase(tables: Record<string, ReturnType<typeof queryFor>[]>) {
  const from = vi.fn((table: string) => {
    const query = tables[table]?.shift();
    if (!query) throw new Error(`Unexpected table query: ${table}`);
    return query;
  });
  return { supabase: { from }, from };
}

function request(query: string) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/entities/search?${query}`);
}

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

describe("campaign entity search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
  });

  it("returns only public campaign-scoped link metadata to players", async () => {
    const empty = () => queryFor([]);
    const { supabase } = createSupabase({
      characters: [queryFor([{ id: "character-1", name: "Astra Vale", species: "Human", class_name: "Envoy" }])],
      npcs: [empty()],
      places: [empty()],
      factions: [empty()],
      jobs: [queryFor([
        { id: "draft-job", title: "Astra's secret", status: "draft" },
        { id: "open-job", title: "Astra's errand", status: "open" },
      ])],
      enemies: [queryFor([
        { id: "hidden-enemy", name: "Astra Mimic", is_revealed: false },
        { id: "revealed-enemy", name: "Astra Guard", is_revealed: true },
      ])],
      episodes: [empty()],
    });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(request("q=Astra&audience=player"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "character-1", type: "characters", label: "Astra Vale", href: `/campaigns/${campaignId}/characters/character-1` }),
      expect.objectContaining({ id: "open-job", type: "jobs" }),
      expect.objectContaining({ id: "revealed-enemy", type: "enemies" }),
    ]));
    expect(payload.entities).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "draft-job" }),
      expect.objectContaining({ id: "hidden-enemy" }),
    ]));
    expect(supabase.from).toHaveBeenCalledTimes(7);
  });

  it("keeps a player-visible note search public even if the client requests GM-only results", async () => {
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Director" });
    const noteQuery = queryFor({ id: noteId, visibility: "player" });
    const empty = () => queryFor([]);
    const { supabase } = createSupabase({
      campaign_notes: [noteQuery],
      characters: [empty()], npcs: [empty()], places: [empty()], factions: [empty()],
      jobs: [queryFor([{ id: "draft-job", title: "Relay shadow", status: "draft" }])],
      enemies: [queryFor([{ id: "hidden-enemy", name: "Relay shade", is_revealed: false }])],
      episodes: [empty()],
    });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(request(`q=Relay&noteId=${noteId}&audience=gm`), routeContext());

    expect(response.status).toBe(200);
    expect(noteQuery.eq).toHaveBeenCalledWith("id", noteId);
    const payload = await response.json();
    expect(payload.entities).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(8);
  });

  it("rejects a GM-only audience request from players", async () => {
    const { supabase } = createSupabase({});
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await GET(request("q=secret&audience=gm"), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("GM access");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});