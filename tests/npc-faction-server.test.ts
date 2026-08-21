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
    const supabase = { from: vi.fn().mockReturnValue(npcQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockResolvedValue([{ ...npc, art_url: "signed-url" }]);
    const { getCampaignNpc } = await import("@/lib/campaign/npcs-server");

    await expect(getCampaignNpc("campaign-1", "npc-1")).resolves.toEqual({
      role: "player",
      displayName: "Pilot",
      npc: { ...npc, art_url: "signed-url" },
    });
    expect(npcQuery.eq).toHaveBeenCalledWith("id", "npc-1");
    expect(npcQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
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

  it("returns null for a missing faction detail", async () => {
    const factionQuery = queryChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(factionQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignFaction } = await import("@/lib/campaign/factions-server");

    await expect(getCampaignFaction("campaign-1", "faction-1")).resolves.toBeNull();
    expect(factionQuery.eq).toHaveBeenCalledWith("id", "faction-1");
    expect(factionQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  });
});