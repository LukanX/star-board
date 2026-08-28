import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  getCampaignRole: vi.fn(),
  addCampaignArtUrls: vi.fn(),
  removeCampaignArtIfUnreferenced: vi.fn(),
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
vi.mock("@/lib/places", () => ({
  validateCampaignPlace: mocks.validateCampaignPlace,
}));

import { GET as listFactions, POST as createFaction } from "@/app/api/campaigns/[campaignId]/factions/route";
import { PATCH as updateFaction } from "@/app/api/campaigns/[campaignId]/factions/[factionId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const factionId = "00000000-0000-4000-8000-000000000003";
const npcId = "00000000-0000-4000-8000-000000000004";

function query(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "in"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected));
  return chain;
}

function params(id = factionId) {
  return { params: Promise.resolve({ campaignId, factionId: id }) };
}

function listParams() {
  return { params: Promise.resolve({ campaignId }) };
}

const faction = {
  id: factionId,
  author_id: userId,
  name: "The Accord",
  description: "Independent brokers.",
  status: "active",
  player_notes_markdown: "Keep the lanes open.",
  place_id: null,
  art_subject: null,
  art_path: null,
  art_prompt: null,
  art_provider: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("faction campaign routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateCampaignPlace.mockResolvedValue({ valid: true, unavailable: false });
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: null })));
    mocks.removeCampaignArtIfUnreferenced.mockResolvedValue(false);
  });

  it("does not read private faction notes for players", async () => {
    const factionQuery = query({ data: [faction], error: null });
    const supabase = { from: vi.fn().mockReturnValue(factionQuery), rpc: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const response = await listFactions(new Request("http://localhost"), listParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.factions[0]).toMatchObject({ id: factionId, player_notes_markdown: "Keep the lanes open." });
    expect(payload.factions[0]).not.toHaveProperty("gm_notes_markdown");
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("creates a faction through the aggregate RPC and returns its committed roster and private notes", async () => {
    const factionQuery = query({ data: faction, error: null });
    const memberQuery = query({ data: [{ id: npcId }], error: null });
    const notesQuery = query({ data: { body_markdown: "Do not trust the brokers." }, error: null });
    const supabase = {
      from: vi.fn((table: string) => table === "factions" ? factionQuery : table === "npcs" ? memberQuery : notesQuery),
      rpc: vi.fn().mockResolvedValue({ data: factionId, error: null }),
    };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");

    const response = await createFaction(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "The Accord",
        description: "Independent brokers.",
        playerNotesMarkdown: "Keep the lanes open.",
        gmNotesMarkdown: "Do not trust the brokers.",
        memberNpcIds: [npcId],
      }),
    }), listParams());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledWith("create_faction_with_details", expect.objectContaining({
      p_campaign_id: campaignId,
      p_member_npc_ids: [npcId],
      p_details: { gmNotesMarkdown: "Do not trust the brokers." },
    }));
    expect(payload).toMatchObject({ memberNpcIds: [npcId], faction: { id: factionId, gm_notes_markdown: "Do not trust the brokers." } });
  });

  it("returns authoritative cleared private notes after an atomic faction update", async () => {
    const previousQuery = query({ data: { art_path: null }, error: null });
    const savedQuery = query({ data: faction, error: null });
    const memberQuery = query({ data: [], error: null });
    const notesQuery = query({ data: null, error: null });
    const factionQueries = [previousQuery, savedQuery];
    const supabase = {
      from: vi.fn((table: string) => table === "factions" ? factionQueries.shift() : table === "npcs" ? memberQuery : notesQuery),
      rpc: vi.fn().mockResolvedValue({ data: factionId, error: null }),
    };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");

    const response = await updateFaction(new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gmNotesMarkdown: "", memberNpcIds: [] }),
    }), params());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("update_faction_with_details", expect.objectContaining({
      p_campaign_id: campaignId,
      p_faction_id: factionId,
      p_details: { gmNotesMarkdown: "" },
      p_member_npc_ids: [],
    }));
    expect(payload).toMatchObject({ memberNpcIds: [], faction: { id: factionId, gm_notes_markdown: "" } });
  });
});