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

describe("campaign NPC and faction server queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not read NPCs for an unauthenticated request", async () => {
    const from = vi.fn();
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const { getCampaignNpcs } = await import("@/lib/campaign/npcs-server");

    await expect(getCampaignNpcs("campaign-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("keeps private NPC notes out of player reads while enriching art", async () => {
    const npc = { id: "npc-1", campaign_id: "campaign-1", author_id: "user-2", name: "Rook", art_path: "campaign-1/npc.png" };
    const npcQuery = queryChain({ data: [npc], error: null });
    const supabase = { from: vi.fn().mockReturnValue(npcQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockImplementation(async (_client, records) => records.map((record: typeof npc) => ({ ...record, art_url: "signed-url" })));
    const { getCampaignNpcs } = await import("@/lib/campaign/npcs-server");

    await expect(getCampaignNpcs("campaign-1")).resolves.toEqual({
      role: "player",
      displayName: "Pilot",
      npcs: [{ ...npc, art_url: "signed-url" }],
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(npcQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });

  it("includes private NPC notes for GMs", async () => {
    const npc = { id: "npc-1", campaign_id: "campaign-1", author_id: "user-2", name: "Rook", art_path: null };
    const npcQuery = queryChain({ data: [npc], error: null });
    const notesQuery = queryChain({ data: [{ npc_id: "npc-1", body_markdown: "Watch the airlock." }], error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(npcQuery).mockReturnValueOnce(notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    mocks.addCampaignArtUrls.mockResolvedValue([npc]);
    const { getCampaignNpcs } = await import("@/lib/campaign/npcs-server");

    await expect(getCampaignNpcs("campaign-1")).resolves.toEqual({
      role: "gm",
      displayName: "GM",
      npcs: [{ ...npc, gm_notes_markdown: "Watch the airlock." }],
    });
    expect(notesQuery.in).toHaveBeenCalledWith("npc_id", ["npc-1"]);
  });

  it("scopes NPC detail reads by campaign and entity", async () => {
    const npc = { id: "npc-1", campaign_id: "campaign-1", author_id: "user-2", name: "Rook", art_path: null };
    const npcQuery = queryChain({ data: npc, error: null });
    const jobsQuery = queryChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(npcQuery).mockReturnValue(jobsQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...npc, art_url: "signed-url" }]);
    const { getCampaignNpc } = await import("@/lib/campaign/npcs-server");

    await expect(getCampaignNpc("campaign-1", "npc-1", Promise.resolve({ role: "player", displayName: "Pilot", places: [] }))).resolves.toEqual({
      role: "player",
      displayName: "Pilot",
      npc: { ...npc, art_url: "signed-url" },
      related: { place: null, faction: null, jobs: [] },
    });
    expect(npcQuery.eq).toHaveBeenCalledWith("id", "npc-1");
    expect(npcQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });

  it("returns an NPC primary Place and campaign-scoped giver Jobs", async () => {
    const npc = { id: "npc-1", campaign_id: "campaign-1", author_id: "user-2", name: "Rook", species: "Android", role: "Contact", place_id: "place-1", art_path: null };
    const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "North Station", kind: "station" };
    const npcQuery = queryChain({ data: npc, error: null });
    const jobsQuery = queryChain({ data: [{ id: "job-1", title: "The Relay", status: "open" }], error: null });
    const supabase = { from: vi.fn((table: string) => table === "npcs" ? npcQuery : jobsQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...npc, art_url: null }]);
    const placesResult = Promise.resolve({ role: "player" as const, displayName: "Pilot", places: [place] });
    const { getCampaignNpc } = await import("@/lib/campaign/npcs-server");

    const result = await getCampaignNpc("campaign-1", "npc-1", placesResult);

    expect(result?.related).toEqual({
      place: { id: "place-1", name: "North Station", kind: "station" },
      faction: null,
      jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
    });
    expect(jobsQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
    expect(jobsQuery.eq).toHaveBeenCalledWith("giver_npc_id", "npc-1");
  });

  it("rejects when NPC giver Jobs cannot be read", async () => {
    const npc = { id: "npc-1", campaign_id: "campaign-1", author_id: "user-2", name: "Rook", place_id: null, art_path: null };
    const npcQuery = queryChain({ data: npc, error: null });
    const jobsQuery = queryChain({ data: null, error: { message: "permission denied" } });
    const supabase = { from: vi.fn((table: string) => table === "npcs" ? npcQuery : jobsQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...npc, art_url: null }]);
    const placesResult = Promise.resolve({ role: "player" as const, displayName: "Pilot", places: [] });
    const { getCampaignNpc } = await import("@/lib/campaign/npcs-server");

    await expect(getCampaignNpc("campaign-1", "npc-1", placesResult)).rejects.toThrow("Unable to read NPC related jobs");
  });

  it("returns an enriched faction list for campaign members", async () => {
    const faction = { id: "faction-1", campaign_id: "campaign-1", author_id: "user-2", name: "The Accord", art_path: "campaign-1/faction.png" };
    const factionQuery = queryChain({ data: [faction], error: null });
    const supabase = { from: vi.fn().mockReturnValue(factionQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...faction, art_url: "signed-url" }]);
    const { getCampaignFactions } = await import("@/lib/campaign/factions-server");

    await expect(getCampaignFactions("campaign-1")).resolves.toEqual({
      role: "player",
      displayName: "Pilot",
      factions: [{ ...faction, art_url: "signed-url" }],
    });
    expect(factionQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });

  it("returns a Faction primary Place and campaign-scoped giver Jobs", async () => {
    const faction = { id: "faction-1", campaign_id: "campaign-1", author_id: "user-2", name: "The Accord", status: "active", place_id: "place-1", art_path: null };
    const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "North Station", kind: "station" };
    const factionQuery = queryChain({ data: faction, error: null });
    const jobsQuery = queryChain({ data: [{ id: "job-1", title: "The Relay", status: "open" }], error: null });
    const supabase = { from: vi.fn((table: string) => table === "factions" ? factionQuery : jobsQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...faction, art_url: null }]);
    const placesResult = Promise.resolve({ role: "player" as const, displayName: "Pilot", places: [place] });
    const { getCampaignFaction } = await import("@/lib/campaign/factions-server");

    const result = await getCampaignFaction("campaign-1", "faction-1", placesResult);

    expect(result?.related).toEqual({
      place: { id: "place-1", name: "North Station", kind: "station" },
      npcs: [],
      jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
    });
    expect(jobsQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
    expect(jobsQuery.eq).toHaveBeenCalledWith("giver_faction_id", "faction-1");
  });

  it("returns null for a missing faction detail", async () => {
    const factionQuery = queryChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(factionQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignFaction } = await import("@/lib/campaign/factions-server");

    await expect(getCampaignFaction("campaign-1", "faction-1", Promise.resolve(null))).resolves.toBeNull();
    expect(factionQuery.eq).toHaveBeenCalledWith("id", "faction-1");
    expect(factionQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });
});