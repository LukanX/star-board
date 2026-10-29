import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignRole: vi.fn(),
  readCampaignEnemyForRole: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignRole: mocks.getCampaignRole,
}));
vi.mock("@/lib/campaign/enemies-server", () => ({
  readCampaignEnemyForRole: mocks.readCampaignEnemyForRole,
}));

import { GET } from "@/app/api/campaigns/[campaignId]/enemies/[enemyId]/export/foundry/route";
import type { ApiEnemy } from "@/lib/campaign/types";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const campaignId = "00000000-0000-4000-8000-000000000001";
const enemyId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const supabase = {};
const defaults = enemyStatBlockSchema.parse({ schemaVersion: 1 });
const enemy: ApiEnemy = {
  id: enemyId,
  campaign_id: campaignId,
  author_id: userId,
  name: "A Test Enemy",
  player_description: "A test description.",
  is_revealed: false,
  art_path: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  level: 2,
  size: "medium",
  rarity: "common",
  traits: ["aberration"],
  stat_block: {
    ...defaults,
    defenses: {
      ...defaults.defenses,
      armorClass: 18,
      hitPoints: [{ label: "HP", value: 20, notes: "" }],
    },
  },
  gm_notes_markdown: "This must not be exported.",
};

function context() {
  return { params: Promise.resolve({ campaignId, enemyId }) };
}

describe("Foundry enemy export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(enemy);
  });

  it("requires authentication and GM access", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    const unauthenticated = await GET(new Request("http://localhost"), context());
    expect(unauthenticated.status).toBe(401);
    expect(mocks.getCampaignRole).not.toHaveBeenCalled();

    mocks.getCampaignRole.mockResolvedValueOnce("player");
    const player = await GET(new Request("http://localhost"), context());
    expect(player.status).toBe(403);
    expect(mocks.readCampaignEnemyForRole).not.toHaveBeenCalled();
  });

  it("returns an uncached actor and warnings without private campaign data", async () => {
    const response = await GET(new Request("http://localhost"), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(payload.fileName).toBe("a-test-enemy-foundry-actor.json");
    expect(payload.actor.type).toBe("npc");
    expect(payload.warnings).toEqual(expect.any(Array));
    expect(JSON.stringify(payload.actor)).not.toContain(campaignId);
    expect(JSON.stringify(payload.actor)).not.toContain("This must not be exported.");
    expect(mocks.readCampaignEnemyForRole).toHaveBeenCalledWith(supabase, campaignId, enemyId, "gm");
  });

  it("returns not found without disclosing another actor", async () => {
    mocks.readCampaignEnemyForRole.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Enemy not found." });
  });
});