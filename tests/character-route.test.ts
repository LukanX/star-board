import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
  getCampaignRole: vi.fn(),
  addCampaignArtUrls: vi.fn(),
  removeCampaignArtIfUnreferenced: vi.fn(),
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

import { POST as createCharacter, GET as listCharacters } from "@/app/api/campaigns/[campaignId]/characters/route";
import { DELETE as deleteCharacter, PATCH as updateCharacter } from "@/app/api/campaigns/[campaignId]/characters/[characterId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const characterId = "00000000-0000-4000-8000-000000000003";

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/campaigns", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function campaignParams() {
  return { params: Promise.resolve({ campaignId }) };
}

function characterParams() {
  return { params: Promise.resolve({ campaignId, characterId }) };
}

function createQuery(data: unknown, error: unknown = null) {
  const query = {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { art_path: null }, error: null }),
  };
  query.insert.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe("character routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: null })));
  });

  it("requires authentication before listing campaign characters", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await listCharacters(new Request("http://localhost"), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication is required.");
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("marks character editing permission for the owner but not another player", async () => {
    const characters = [
      { id: characterId, owner_id: userId, name: "Nova" },
      { id: "00000000-0000-4000-8000-000000000004", owner_id: "00000000-0000-4000-8000-000000000005", name: "Rook" },
    ];
    const query = createQuery(characters);
    query.order.mockResolvedValue({ data: characters, error: null });
    const supabase = { from: vi.fn().mockReturnValue(query) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Player" });

    const response = await listCharacters(new Request("http://localhost"), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.characters.map((character: { can_edit: boolean }) => character.can_edit)).toEqual([true, false]);

    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    const gmResponse = await listCharacters(new Request("http://localhost"), campaignParams());
    const gmPayload = await gmResponse.json();

    expect(gmPayload.characters.map((character: { can_edit: boolean }) => character.can_edit)).toEqual([true, true]);
  });

  it("rejects character creation for a non-member", async () => {
    const supabase = { from: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue(null);

    const response = await createCharacter(request({ name: "Nova" }), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Campaign membership is required.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("attributes a new character to the authenticated owner", async () => {
    const character = { id: characterId, owner_id: userId, name: "Nova", species: "Android", class_name: "Mechanic", level: 3, backstory_markdown: "", physical_description: "Tall with silver eyes.", art_subject: "A silver-eyed mechanic in a worn flight jacket.", art_path: null, art_prompt: "A cinematic portrait", art_provider: "openrouter" };
    const query = createQuery(character);
    const supabase = { from: vi.fn().mockReturnValue(query) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("player");

    const response = await createCharacter(request({ name: " Nova ", species: "Android", className: "Mechanic", level: 3, physicalDescription: "Tall with silver eyes.", artSubject: "A silver-eyed mechanic in a worn flight jacket.", artPrompt: "A cinematic portrait", artProvider: "openrouter" }), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.character).toMatchObject({ id: characterId, owner_id: userId, art_url: null });
    expect(query.insert).toHaveBeenCalledWith({
      campaign_id: campaignId,
      owner_id: userId,
      name: "Nova",
      species: "Android",
      class_name: "Mechanic",
      level: 3,
      backstory_markdown: "",
      physical_description: "Tall with silver eyes.",
      art_subject: "A silver-eyed mechanic in a worn flight jacket.",
      art_path: null,
      art_prompt: "A cinematic portrait",
      art_provider: "openrouter",
      updated_by: userId,
    });
  });

  it("updates a character within the requested campaign", async () => {
    const query = createQuery({ id: characterId, owner_id: userId, name: "Nova Prime", art_path: null });
    const supabase = { from: vi.fn().mockReturnValue(query) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await updateCharacter(request({ name: "Nova Prime" }, "PATCH"), characterParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.character.id).toBe(characterId);
    expect(query.update).toHaveBeenCalledWith({ name: "Nova Prime", updated_by: userId });
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", characterId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("deletes only the requested character in the requested campaign", async () => {
    const query = createQuery({ id: characterId });
    const supabase = { from: vi.fn().mockReturnValue(query) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await deleteCharacter(new Request("http://localhost", { method: "DELETE" }), characterParams());

    expect(response.status).toBe(204);
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", characterId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });
});