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

import { GET as getPlace, PATCH as updatePlace } from "@/app/api/campaigns/[campaignId]/places/[placeId]/route";
import { GET as listPlaces, POST as createPlace } from "@/app/api/campaigns/[campaignId]/places/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const placeId = "00000000-0000-4000-8000-000000000003";
const parentId = "00000000-0000-4000-8000-000000000004";

function listParams() {
  return { params: Promise.resolve({ campaignId }) };
}

function detailParams(detailPlaceId: string) {
  return { params: Promise.resolve({ campaignId, placeId: detailPlaceId }) };
}

function createQuery(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "in", "insert", "update", "delete", "upsert"]) {
    query[method] = vi.fn();
    query[method].mockReturnValue(query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.single = vi.fn().mockResolvedValue(result);
  query.order.mockResolvedValue(result);
  query.in.mockResolvedValue(result);
  query.then = vi.fn((onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected));
  return query;
}

const place = {
  id: placeId,
  campaign_id: campaignId,
  author_id: userId,
  parent_place_id: null,
  name: "Asterion",
  kind: "planet",
  description: "A frontier world.",
  player_notes_markdown: "A public brief.",
  art_subject: null,
  art_path: null,
  art_prompt: null,
  art_provider: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("Places campaign routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addCampaignArtUrls.mockImplementation(async (_supabase: unknown, records: Array<Record<string, unknown>>) => records.map((record) => ({ ...record, art_url: null })));
    mocks.removeCampaignArtIfUnreferenced.mockResolvedValue(false);
  });

  it("keeps GM notes out of player place responses", async () => {
    const placeQuery = createQuery({ data: place, error: null });
    const supabase = { from: vi.fn().mockReturnValue(placeQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const response = await getPlace(new Request("http://localhost"), detailParams(placeId));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.role).toBe("player");
    expect(payload.place).toEqual(expect.objectContaining({ id: placeId, name: "Asterion" }));
    expect(payload.place).not.toHaveProperty("gm_notes_markdown");
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("includes GM notes when a GM lists campaign places", async () => {
    const placesQuery = createQuery({ data: [place], error: null });
    const notesQuery = createQuery({ data: [{ place_id: placeId, body_markdown: "A sealed gate is buried below the capital." }], error: null });
    const supabase = { from: vi.fn((table: string) => table === "places" ? placesQuery : notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });

    const response = await listPlaces(new Request("http://localhost"), listParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.places[0]).toMatchObject({ id: placeId, gm_notes_markdown: "A sealed gate is buried below the capital." });
    expect(payload.displayName).toBe("GM");
  });

  it("rejects a child whose parent is outside the campaign", async () => {
    const parentQuery = createQuery({ data: null, error: null });
    const insertQuery = createQuery({ data: place, error: null });
    const supabase = { from: vi.fn((table: string) => table === "places" ? parentQuery : insertQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");

    const response = await createPlace(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Night Market", kind: "district", parentPlaceId: parentId }),
    }), listParams());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Place parent must belong to this campaign.");
    expect(insertQuery.insert).not.toHaveBeenCalled();
  });

  it("creates a place and persists private notes for a GM", async () => {
    const insertQuery = createQuery({ data: { ...place, name: "Night Market", parent_place_id: parentId }, error: null });
    const notesQuery = createQuery({ data: null, error: null });
    const supabase = { from: vi.fn((table: string) => table === "places" ? insertQuery : notesQuery) };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");

    const response = await createPlace(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Night Market", kind: "district", parentPlaceId: parentId, gmNotesMarkdown: "The gate is watched." }),
    }), listParams());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.place).toMatchObject({ name: "Night Market", gm_notes_markdown: "The gate is watched." });
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: campaignId, parent_place_id: parentId, name: "Night Market" }));
    expect(notesQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ place_id: placeId, body_markdown: "The gate is watched." }));
  });

  it("rejects an empty update before checking database state", async () => {
    const response = await updatePlace(new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), detailParams(placeId));

    expect(response.status).toBe(400);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });
});
