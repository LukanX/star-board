import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  getCampaignJobs: vi.fn(),
  getCampaignCharacters: vi.fn(),
  getCampaignNpcs: vi.fn(),
  getCampaignFactions: vi.fn(),
  getCampaignPlaces: vi.fn(),
  getCampaignNotes: vi.fn(),
  getCampaignEpisodes: vi.fn(),
  getCampaignMembers: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));
vi.mock("@/lib/campaign/jobs-server", () => ({ getCampaignJobs: mocks.getCampaignJobs }));
vi.mock("@/lib/campaign/characters-server", () => ({ getCampaignCharacters: mocks.getCampaignCharacters }));
vi.mock("@/lib/campaign/npcs-server", () => ({ getCampaignNpcs: mocks.getCampaignNpcs }));
vi.mock("@/lib/campaign/factions-server", () => ({ getCampaignFactions: mocks.getCampaignFactions }));
vi.mock("@/lib/campaign/places-server", () => ({ getCampaignPlaces: mocks.getCampaignPlaces }));
vi.mock("@/lib/campaign/notes-server", () => ({ getCampaignNotes: mocks.getCampaignNotes }));
vi.mock("@/lib/campaign/episodes-server", () => ({ getCampaignEpisodes: mocks.getCampaignEpisodes }));
vi.mock("@/lib/campaign/members-server", () => ({ getCampaignMembers: mocks.getCampaignMembers }));

describe("campaign server route reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null for an unauthenticated request", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("returns null for a non-member without reading campaign data", async () => {
    const from = vi.fn();
    const supabase = { from };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue(null);
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns normalized access for a member with a campaign", async () => {
    const campaign = { id: "campaign-1", name: "Starfall", system: "scifi", description: "Brief", created_by: "gm-1" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: campaign, error: null });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toEqual({ campaign, role: "player", displayName: "Nova" });
    expect(select).toHaveBeenCalledWith("id, name, system, description, created_by");
  });

  it("rejects with a descriptive error when the campaign query fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "database offline" } });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).rejects.toThrow("Unable to read campaign route: database offline");
  });

  it("returns null when the campaign is missing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignRouteAccess } = await import("@/lib/campaign/server");

    await expect(getCampaignRouteAccess("campaign-1")).resolves.toBeNull();
  });

  it("returns a campaign-scoped overview with the route role and display name", async () => {
    const campaign = { id: "campaign-1", name: "Starfall", system: "scifi", description: "Brief", created_by: "gm-1" };
    const maybeSingle = vi.fn().mockResolvedValue({ data: campaign, error: null });
    const eqId = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Nova" });

    const jobs = { role: "player", displayName: "Nova", jobs: [{ id: "job-1" }] };
    const characters = { role: "player", displayName: "Nova", characters: [{ id: "character-1" }] };
    const npcs = { role: "player", displayName: "Nova", npcs: [{ id: "npc-1" }] };
    const factions = { role: "player", displayName: "Nova", factions: [{ id: "faction-1" }] };
    const places = { role: "player", displayName: "Nova", places: [{ id: "place-1" }] };
    const notes = { role: "player", displayName: "Nova", notes: [{ id: "note-1" }] };
    const episodes = { role: "player", displayName: "Nova", episodes: [{ id: "episode-1" }] };
    const members = { role: "player", displayName: "Nova", members: [{ userId: "user-1" }] };
    mocks.getCampaignJobs.mockResolvedValue(jobs);
    mocks.getCampaignCharacters.mockResolvedValue(characters);
    mocks.getCampaignNpcs.mockResolvedValue(npcs);
    mocks.getCampaignFactions.mockResolvedValue(factions);
    mocks.getCampaignPlaces.mockResolvedValue(places);
    mocks.getCampaignNotes.mockResolvedValue(notes);
    mocks.getCampaignEpisodes.mockResolvedValue(episodes);
    mocks.getCampaignMembers.mockResolvedValue(members);

    const { getCampaignOverview } = await import("@/lib/campaign/server");
    const result = await getCampaignOverview("campaign-1");

    expect(result).toEqual({ campaign, role: "player", displayName: "Nova", jobs: jobs.jobs, characters: characters.characters, npcs: npcs.npcs, factions: factions.factions, places: places.places, notes: notes.notes, episodes: episodes.episodes, members: members.members });
    expect(mocks.getCampaignJobs).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignCharacters).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignNpcs).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignFactions).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignPlaces).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignNotes).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignEpisodes).toHaveBeenCalledWith("campaign-1");
    expect(mocks.getCampaignMembers).toHaveBeenCalledWith("campaign-1");
    expect(eqId).toHaveBeenCalledWith("id", "campaign-1");
  });
});
