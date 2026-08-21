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
  const terminal = vi.fn().mockResolvedValue(result);
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: terminal,
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  (chain as typeof chain & { then: (resolve: (value: unknown) => void) => void }).then = (resolve) => resolve(result);
  return { chain, terminal };
}

describe("campaign character server queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires authentication and membership before listing characters", async () => {
    const from = vi.fn();
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const { getCampaignCharacters } = await import("@/lib/campaign/characters-server");

    await expect(getCampaignCharacters("campaign-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("does not read characters for an authenticated non-member", async () => {
    const from = vi.fn();
    const supabase = { from };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue(null);
    const { getCampaignCharacters } = await import("@/lib/campaign/characters-server");

    await expect(getCampaignCharacters("campaign-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("enriches a member character list with signed art URLs and edit permissions", async () => {
    const character = { id: "character-1", campaign_id: "campaign-1", owner_id: "user-1", name: "Nova", art_path: "campaign-1/user-1/nova.png" };
    const { chain } = queryChain({ data: [character], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });
    mocks.addCampaignArtUrls.mockImplementation(async (_client, records) => records.map((record: typeof character) => ({ ...record, art_url: "signed-url" })));
    const { getCampaignCharacters } = await import("@/lib/campaign/characters-server");

    await expect(getCampaignCharacters("campaign-1")).resolves.toEqual({
      role: "player",
      displayName: "Pilot",
      characters: [{ ...character, art_url: "signed-url", can_edit: true }],
    });
    expect(chain.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
    expect(mocks.addCampaignArtUrls).toHaveBeenCalledWith(supabase, [character]);
  });

  it("scopes detail reads by campaign and character, returning null when absent", async () => {
    const { chain } = queryChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignCharacter } = await import("@/lib/campaign/characters-server");

    await expect(getCampaignCharacter("campaign-1", "character-1")).resolves.toBeNull();
    expect(chain.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
    expect(chain.eq).toHaveBeenCalledWith("id", "character-1");
    expect(mocks.addCampaignArtUrls).not.toHaveBeenCalled();
  });

  it("throws a descriptive error for character query failures", async () => {
    const { chain } = queryChain({ data: null, error: { message: "database offline" } });
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const { getCampaignCharacter } = await import("@/lib/campaign/characters-server");

    await expect(getCampaignCharacter("campaign-1", "character-1")).rejects.toThrow(
      "Unable to read campaign character: database offline",
    );
  });
});