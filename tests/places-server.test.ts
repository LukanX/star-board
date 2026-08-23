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

vi.mock("@/lib/storage/campaign-art", () => ({
  addCampaignArtUrls: mocks.addCampaignArtUrls,
}));

function queryChain(result: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  (chain as typeof chain & { then: (resolve: (value: unknown) => void) => void }).then = (resolve) => resolve(result);
  return chain;
}

describe("campaign Places server queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not read places for an unauthenticated request", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const { getCampaignPlaces } = await import("@/lib/campaign/places-server");

    await expect(getCampaignPlaces("campaign-1")).resolves.toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("keeps private place notes out of player lists while enriching art", async () => {
    const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "Asterion", kind: "planet", art_path: "campaign-1/place.png" };
    const placesQuery = queryChain({ data: [place], error: null });
    const supabase = { from: vi.fn().mockReturnValue(placesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...place, art_url: "signed-url" }]);
    const { getCampaignPlaces } = await import("@/lib/campaign/places-server");

    await expect(getCampaignPlaces("campaign-1")).resolves.toEqual({
      role: "player",
      displayName: "Pilot",
      places: [{ ...place, art_url: "signed-url" }],
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(placesQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });

  it("includes private notes for GM detail reads and scopes the entity", async () => {
    const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: "parent-1", name: "Night Market", kind: "district", art_path: null };
    const placeQuery = queryChain({ data: place, error: null });
    const notesQuery = queryChain({ data: { body_markdown: "The gate is watched." }, error: null });
    const relationQuery = queryChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(placeQuery).mockReturnValueOnce(notesQuery).mockReturnValue(relationQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...place, art_url: null }]);
    const { getCampaignPlace } = await import("@/lib/campaign/places-server");

    await expect(getCampaignPlace("campaign-1", "place-1", Promise.resolve({ role: "gm", displayName: "GM", places: [place] }))).resolves.toEqual({
      role: "gm",
      displayName: "GM",
      place: { ...place, art_url: null, gm_notes_markdown: "The gate is watched." },
      related: { parent: null, children: [], npcs: [], factions: [], jobs: [], episodes: [] },
    });
    expect(placeQuery.eq).toHaveBeenCalledWith("id", "place-1");
    expect(placeQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
    expect(notesQuery.eq).toHaveBeenCalledWith("place_id", "place-1");
  });

  it("returns campaign-scoped Place relations from the shared Place collection", async () => {
    const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: "parent-1", name: "Night Market", kind: "district", art_path: null };
    const parent = { id: "parent-1", campaign_id: "campaign-1", parent_place_id: null, name: "Asterion", kind: "planet", art_path: null };
    const child = { id: "child-1", campaign_id: "campaign-1", parent_place_id: "place-1", name: "Gate", kind: "checkpoint", art_path: null };
    const placesResult = Promise.resolve({ role: "gm" as const, displayName: "GM", places: [parent, place, child] });
    const placeQuery = queryChain({ data: place, error: null });
    const notesQuery = queryChain({ data: { body_markdown: "The gate is watched." }, error: null });
    const placeNpcsQuery = queryChain({ data: [{ id: "npc-1", name: "Rook", species: "Android", role: "Contact" }], error: null });
    const placeFactionsQuery = queryChain({ data: [{ id: "faction-1", name: "The Accord", status: "active" }], error: null });
    const placeJobsQuery = queryChain({ data: [{ id: "job-1", title: "The Relay", status: "open" }], error: null });
    const placeEpisodesQuery = queryChain({ data: [{ id: "episode-1", title: "Signal Lost", status: "active" }], error: null });
    const queries = { places: placeQuery, place_gm_notes: notesQuery, npcs: placeNpcsQuery, factions: placeFactionsQuery, jobs: placeJobsQuery, episodes: placeEpisodesQuery };
    const supabase = { from: vi.fn((table: keyof typeof queries) => queries[table]) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...place, art_url: null }]);
    const { getCampaignPlace } = await import("@/lib/campaign/places-server");

    const result = await getCampaignPlace("campaign-1", "place-1", placesResult);

    expect(result?.related).toEqual({
      parent: { id: "parent-1", name: "Asterion", kind: "planet" },
      children: [{ id: "child-1", name: "Gate", kind: "checkpoint" }],
      npcs: [{ id: "npc-1", name: "Rook", species: "Android", role: "Contact" }],
      factions: [{ id: "faction-1", name: "The Accord", status: "active" }],
      jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
      episodes: [{ id: "episode-1", title: "Signal Lost", status: "active" }],
    });
    for (const relationQuery of [placeNpcsQuery, placeFactionsQuery, placeJobsQuery, placeEpisodesQuery]) {
      expect(relationQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
      expect(relationQuery.eq).toHaveBeenCalledWith("place_id", "place-1");
    }
  });

  it("rejects when a Place relation query fails", async () => {
    const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "Night Market", kind: "district", art_path: null };
    const placesResult = Promise.resolve({ role: "player" as const, displayName: "Pilot", places: [place] });
    const placeQuery = queryChain({ data: place, error: null });
    const failingNpcsQuery = queryChain({ data: null, error: { message: "permission denied" } });
    const emptyQuery = queryChain({ data: [], error: null });
    const queries = { places: placeQuery, npcs: failingNpcsQuery, factions: emptyQuery, jobs: emptyQuery, episodes: emptyQuery };
    const supabase = { from: vi.fn((table: keyof typeof queries) => queries[table]) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...place, art_url: null }]);
    const { getCampaignPlace } = await import("@/lib/campaign/places-server");

    await expect(getCampaignPlace("campaign-1", "place-1", placesResult)).rejects.toThrow("Unable to read campaign place relations");
  });

  it("returns null for a missing place detail", async () => {
    const placeQuery = queryChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(placeQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    const { getCampaignPlace } = await import("@/lib/campaign/places-server");

    await expect(getCampaignPlace("campaign-1", "place-1", Promise.resolve(null))).resolves.toBeNull();
    expect(placeQuery.eq).toHaveBeenCalledWith("id", "place-1");
    expect(placeQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });
});