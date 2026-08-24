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

import { getCampaignEnemy, readCampaignEnemiesForRole } from "@/lib/campaign/enemies-server";

const campaignId = "00000000-0000-4000-8000-000000000001";
const enemyId = "00000000-0000-4000-8000-000000000002";

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

const publicEnemy = {
  id: enemyId,
  campaign_id: campaignId,
  author_id: "00000000-0000-4000-8000-000000000003",
  name: "Void Stalker",
  player_description: "A silent shape moving between the stars.",
  is_revealed: true,
  art_path: "campaign-1/gm-1/enemy-art.png",
  created_at: "2026-08-23T12:00:00.000Z",
  updated_at: "2026-08-23T12:00:00.000Z",
};

const detail = {
  enemy_id: enemyId,
  campaign_id: campaignId,
  level: 7,
  size: "large" as const,
  rarity: "uncommon" as const,
  traits: ["aberration", "occult"],
  family: null,
  stat_block: { schemaVersion: 1 },
  gm_notes_markdown: "The sealed frequency is its weakness.",
  origin: "manual" as const,
  art_subject: "A void stalker",
  art_prompt: null,
  art_provider: null,
  source_provider: null,
  source_external_id: null,
  source_content_hash: null,
  source_snapshot: null,
  created_at: publicEnemy.created_at,
  updated_at: publicEnemy.updated_at,
};

describe("campaign enemy server projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: "signed-art-url" })));
  });

  it("returns only public fields for players", async () => {
    const publicQuery = queryChain({ data: [publicEnemy], error: null });
    const supabase = { from: vi.fn().mockReturnValue(publicQuery) };

    const result = await readCampaignEnemiesForRole(supabase as never, campaignId, "player");

    expect(result).toEqual([{ ...publicEnemy, art_url: "signed-art-url" }]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(mocks.addCampaignArtUrls).toHaveBeenCalledWith(supabase, [publicEnemy], true);
  });

  it("joins GM details and applies level, trait, and sort filters", async () => {
    const publicQuery = queryChain({ data: [publicEnemy], error: null });
    const detailQuery = queryChain({ data: [detail], error: null });
    const supabase = { from: vi.fn().mockReturnValueOnce(publicQuery).mockReturnValueOnce(detailQuery) };

    const result = await readCampaignEnemiesForRole(supabase as never, campaignId, "gm", { level: 7, trait: "occult", sort: "level" });

    expect(result[0]).toMatchObject({
      id: enemyId,
      level: 7,
      size: "large",
      traits: ["aberration", "occult"],
      gm_notes_markdown: "The sealed frequency is its weakness.",
      stat_block: expect.objectContaining({ schemaVersion: 1, perception: expect.any(Object) }),
      art_url: "signed-art-url",
    });
    expect(detailQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(detailQuery.in).toHaveBeenCalledWith("enemy_id", [enemyId]);
  });

  it("requires authentication before reading a campaign enemy", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(getCampaignEnemy(campaignId, enemyId)).resolves.toBeNull();
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });
});
