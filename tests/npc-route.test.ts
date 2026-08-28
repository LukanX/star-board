import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  getCampaignRole: vi.fn(),
  addCampaignArtUrls: vi.fn(),
  removeCampaignArtIfUnreferenced: vi.fn(),
  validateCampaignFaction: vi.fn(),
  validateCampaignPlace: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
  getCampaignRole: mocks.getCampaignRole,
}));
vi.mock("@/lib/storage/campaign-art", () => ({
  addCampaignArtUrls: mocks.addCampaignArtUrls,
  removeCampaignArtIfUnreferenced: mocks.removeCampaignArtIfUnreferenced,
}));
vi.mock("@/lib/factions", () => ({ validateCampaignFaction: mocks.validateCampaignFaction }));
vi.mock("@/lib/places", () => ({ validateCampaignPlace: mocks.validateCampaignPlace }));

import { POST as createNpc } from "@/app/api/campaigns/[campaignId]/npcs/route";
import { PATCH as updateNpc } from "@/app/api/campaigns/[campaignId]/npcs/[npcId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const npcId = "00000000-0000-4000-8000-000000000003";
const factionId = "00000000-0000-4000-8000-000000000004";
const placeId = "00000000-0000-4000-8000-000000000005";

function query(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "in", "insert", "update", "delete", "upsert"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected));
  return chain;
}

function listParams() {
  return { params: Promise.resolve({ campaignId }) };
}

function detailParams() {
  return { params: Promise.resolve({ campaignId, npcId }) };
}

const npc = {
  id: npcId,
  author_id: userId,
  name: "Relay Keeper",
  species: "Android",
  role: "Contact",
  description: "Keeps the signal alive.",
  player_notes_markdown: "Trusted by the dock crews.",
  place_id: placeId,
  faction_id: factionId,
  art_subject: null,
  art_path: null,
  art_prompt: null,
  art_provider: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("NPC faction campaign routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateCampaignPlace.mockResolvedValue({ valid: true, unavailable: false });
    mocks.validateCampaignFaction.mockResolvedValue({ valid: true, unavailable: false });
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: null })));
    mocks.removeCampaignArtIfUnreferenced.mockResolvedValue(false);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
  });

  it("creates an NPC with a campaign-scoped faction assignment", async () => {
    const insertQuery = query({ data: npc, error: null });
    const supabase = { from: vi.fn().mockReturnValue(insertQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await createNpc(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: npc.name,
        species: npc.species,
        role: npc.role,
        description: npc.description,
        playerNotesMarkdown: npc.player_notes_markdown,
        placeId,
        factionId,
      }),
    }), listParams());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.validateCampaignFaction).toHaveBeenCalledWith(supabase, campaignId, factionId);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: campaignId, faction_id: factionId }));
    expect(payload.npc).toMatchObject({ id: npcId, faction_id: factionId });
  });

  it("rejects a faction from another campaign before creating the NPC", async () => {
    const insertQuery = query({ data: npc, error: null });
    const supabase = { from: vi.fn().mockReturnValue(insertQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.validateCampaignFaction.mockResolvedValue({ valid: false, unavailable: false });

    const response = await createNpc(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: npc.name, factionId }),
    }), listParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("NPC faction must belong to this campaign.");
    expect(insertQuery.insert).not.toHaveBeenCalled();
  });

  it("clears an NPC faction when the update explicitly sends null", async () => {
    const previousQuery = query({ data: { art_path: null }, error: null });
    const updateQuery = query({ data: { ...npc, faction_id: null }, error: null });
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(previousQuery)
        .mockReturnValueOnce(updateQuery),
    };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateNpc(new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ factionId: null }),
    }), detailParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.validateCampaignFaction).toHaveBeenCalledWith(supabase, campaignId, null);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ faction_id: null }));
    expect(payload.npc).toMatchObject({ id: npcId, faction_id: null });
  });
});