import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAonFetchError extends Error {
    code = "HTTP_STATUS";
  }
  class MockAonParseError extends Error {}
  return {
    getAuthenticatedUser: vi.fn(),
    getCampaignMembership: vi.fn(),
    getCampaignRole: vi.fn(),
    readCampaignEnemiesForRole: vi.fn(),
    readCampaignEnemyForRole: vi.fn(),
    removeCampaignArtIfUnreferenced: vi.fn(),
    createCampaignArtSignedUrl: vi.fn(),
    fetchAonCreatureHtml: vi.fn(),
    parseAonCreatureHtml: vi.fn(),
    createAonSourceSnapshot: vi.fn(),
    createAonImportPayload: vi.fn(),
    MockAonFetchError,
    MockAonParseError,
  };
});

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
  getCampaignRole: mocks.getCampaignRole,
}));
vi.mock("@/lib/campaign/enemies-server", () => ({
  readCampaignEnemiesForRole: mocks.readCampaignEnemiesForRole,
  readCampaignEnemyForRole: mocks.readCampaignEnemyForRole,
}));
vi.mock("@/lib/storage/campaign-art", () => ({
  isExternalArtPath: (path: string) => path.startsWith("https://"),
  validateCampaignArtPath: (campaignId: string, path: string) => path.startsWith(`${campaignId}/`),
  createCampaignArtSignedUrl: mocks.createCampaignArtSignedUrl,
  removeCampaignArtIfUnreferenced: mocks.removeCampaignArtIfUnreferenced,
}));
vi.mock("@/lib/enemies/aon-fetch", () => ({
  fetchAonCreatureHtml: mocks.fetchAonCreatureHtml,
  AonFetchError: mocks.MockAonFetchError,
}));
vi.mock("@/lib/enemies/aon-parser", () => ({
  parseAonCreatureHtml: mocks.parseAonCreatureHtml,
  AonParseError: mocks.MockAonParseError,
}));
vi.mock("@/lib/enemies/aon-import", () => ({
  createAonSourceSnapshot: mocks.createAonSourceSnapshot,
  createAonImportPayload: mocks.createAonImportPayload,
}));

import { GET as listEnemies, POST as createEnemy } from "@/app/api/campaigns/[campaignId]/enemies/route";
import { DELETE as deleteEnemy, PATCH as updateEnemy } from "@/app/api/campaigns/[campaignId]/enemies/[enemyId]/route";
import { POST as reimportEnemy } from "@/app/api/campaigns/[campaignId]/enemies/[enemyId]/reimport/route";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const campaignId = "00000000-0000-4000-8000-000000000001";
const enemyId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

function campaignParams() {
  return { params: Promise.resolve({ campaignId }) };
}

function enemyParams() {
  return { params: Promise.resolve({ campaignId, enemyId }) };
}

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/campaigns", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const statBlock = { schemaVersion: 1 };
const completeStatBlock = (() => {
  const defaults = enemyStatBlockSchema.parse(statBlock);
  return {
    ...defaults,
    defenses: {
      ...defaults.defenses,
      armorClass: 22,
      hitPoints: [{ label: "HP", value: 100, notes: "" }],
    },
  };
})();
const validInput = {
  name: "Void Stalker",
  playerDescription: "A silent threat between the stars.",
  isRevealed: false,
  level: 7,
  size: "large",
  rarity: "uncommon",
  traits: ["aberration"],
  family: null,
  statBlock,
  gmNotesMarkdown: "Keep the sealed frequency secret.",
  origin: "manual",
  artPath: null,
};

const enemy = {
  id: enemyId,
  campaign_id: campaignId,
  name: "Void Stalker",
  player_description: "A silent threat between the stars.",
  is_revealed: false,
  art_path: null,
  level: 7,
  size: "large",
  rarity: "uncommon",
  traits: ["aberration"],
  family: null,
  origin: "manual",
  stat_block: { schemaVersion: 1 },
  gm_notes_markdown: "Keep the sealed frequency secret.",
  art_subject: null,
  art_prompt: null,
  art_provider: null,
  source_snapshot: null,
  updated_at: "2026-08-23T12:00:00.000Z",
};

const aonSourceSnapshot = {
  provider: "aon",
  system: "Starfinder 2e",
  externalId: 42,
  canonicalUrl: "https://2e.aonsrd.com/creatures/42-void-sentinel",
  sourceTitle: "Alien Core",
  sourcePage: "77",
  rulesStatus: "unreviewed import",
  parserVersion: "aon-creature-v1",
  schemaVersion: 1,
  retrievedAt: "2026-08-23T12:00:00.000Z",
  contentHash: "b".repeat(64),
  parsedPayload: { name: "Void Sentinel", level: 7, size: "large", rarity: "uncommon", traits: ["construct"], family: null, statBlock: completeStatBlock },
};

const aonPayload = {
  name: "Void Sentinel",
  level: 7,
  size: "large",
  rarity: "uncommon",
  traits: ["construct"],
  family: null,
  statBlock: completeStatBlock,
  sourceSnapshot: aonSourceSnapshot,
};

const aonEnemy = {
  ...enemy,
  name: "Void Sentinel",
  origin: "aon",
  source_provider: "aon",
  source_external_id: 42,
  source_content_hash: aonSourceSnapshot.contentHash,
  source_snapshot: aonSourceSnapshot,
};

function configureFreshAonSource() {
  mocks.fetchAonCreatureHtml.mockResolvedValue({ url: { externalId: 42, canonicalUrl: aonSourceSnapshot.canonicalUrl }, html: "<html />" });
  mocks.parseAonCreatureHtml.mockReturnValue({});
  mocks.createAonSourceSnapshot.mockReturnValue(aonSourceSnapshot);
  mocks.createAonImportPayload.mockReturnValue(aonPayload);
}

function reviewedReimportBody(overrides: Record<string, unknown> = {}) {
  return {
    expectedSourceHash: aonSourceSnapshot.contentHash,
    expectedUpdatedAt: enemy.updated_at,
    url: aonSourceSnapshot.canonicalUrl,
    reviewedSource: {
      name: aonPayload.name,
      level: aonPayload.level,
      size: aonPayload.size,
      rarity: aonPayload.rarity,
      traits: aonPayload.traits,
      family: aonPayload.family,
      statBlock: aonPayload.statBlock,
      sourceSnapshot: aonSourceSnapshot,
    },
    ...overrides,
  };
}

describe("enemy campaign routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: { rpc: vi.fn() }, user: { id: userId } });
  });

  it("requires authentication before listing enemies", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await listEnemies(new Request("http://localhost"), campaignParams());

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Authentication is required.");
    expect(mocks.getCampaignMembership).not.toHaveBeenCalled();
  });

  it("passes archive filters through the GM list route", async () => {
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });
    mocks.readCampaignEnemiesForRole.mockResolvedValue([enemy]);
    const supabase = { rpc: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await listEnemies(new Request("http://localhost?name=void&trait=aberration&level=7&size=large&rarity=uncommon&sort=updated"), campaignParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.enemies).toEqual([enemy]);
    expect(mocks.readCampaignEnemiesForRole).toHaveBeenCalledWith(supabase, campaignId, "gm", {
      name: "void",
      trait: "aberration",
      level: 7,
      size: "large",
      rarity: "uncommon",
      sort: "updated",
    });
  });

  it("blocks enemy creation for players", async () => {
    mocks.getCampaignRole.mockResolvedValue("player");
    const response = await createEnemy(request(validInput), campaignParams());

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("GM access is required.");
  });

  it("creates enemies through the atomic parent/detail RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: enemyId, error: null });
    const supabase = { rpc };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(enemy);

    const response = await createEnemy(request(validInput), campaignParams());

    expect(response.status).toBe(201);
    expect((await response.json()).enemy).toEqual(enemy);
    expect(rpc).toHaveBeenCalledWith("create_enemy_with_details", expect.objectContaining({
      p_campaign_id: campaignId,
      p_public: expect.objectContaining({ name: "Void Stalker", isRevealed: false }),
      p_details: expect.objectContaining({ level: 7, statBlock: expect.objectContaining({ schemaVersion: 1 }) }),
    }));
  });

  it("returns a conflict for duplicate source records", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } });
    const supabase = { rpc };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    const sourceSnapshot = {
      provider: "aon",
      system: "Starfinder 2e",
      externalId: 12,
      canonicalUrl: "https://2e.aonsrd.com/creatures/12-void-stalker",
      sourceTitle: "Void Stalker",
      sourcePage: "Not listed",
      rulesStatus: "unreviewed import",
      parserVersion: "aon-creature-v1",
      schemaVersion: 1,
      retrievedAt: "2026-08-23T12:00:00.000Z",
      contentHash: "a".repeat(64),
      parsedPayload: { name: "Void Stalker", level: 7, size: "large", rarity: "uncommon", traits: ["aberration"], family: null, statBlock: completeStatBlock },
    };
    mocks.fetchAonCreatureHtml.mockResolvedValue({ url: { externalId: 12, canonicalUrl: sourceSnapshot.canonicalUrl }, html: "<html />" });
    mocks.parseAonCreatureHtml.mockReturnValue({});
    mocks.createAonSourceSnapshot.mockReturnValue(sourceSnapshot);
    mocks.createAonImportPayload.mockReturnValue({ name: "Void Stalker", level: 7, size: "large", rarity: "uncommon", traits: ["aberration"], family: null, statBlock: completeStatBlock, sourceSnapshot });

    const response = await createEnemy(request({ ...validInput, statBlock: completeStatBlock, origin: "aon", sourceSnapshot: {
      ...sourceSnapshot,
    } }), campaignParams());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("source record");
  });

  it("updates and deletes enemies only inside the requested campaign", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: enemyId, error: null });
    const supabase = { rpc, from: vi.fn() };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(enemy);

    const patchResponse = await updateEnemy(request({ name: "Void Stalker Prime", expectedUpdatedAt: enemy.updated_at }, "PATCH"), enemyParams());
    expect(patchResponse.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_enemy_with_details", expect.objectContaining({ p_campaign_id: campaignId, p_enemy_id: enemyId }));

    const query = {
      delete: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: enemyId, art_path: null }, error: null }),
    };
    query.delete.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    supabase.from.mockReturnValue(query);

    const deleteResponse = await deleteEnemy(new Request("http://localhost", { method: "DELETE" }), enemyParams());
    expect(deleteResponse.status).toBe(204);
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", enemyId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "campaign_id", campaignId);
  });

  it("allows an AoN record to detach before saving edited mechanics", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: enemyId, error: null });
    const supabase = { rpc };
    const detachedStatBlock = {
      ...completeStatBlock,
      defenses: {
        ...completeStatBlock.defenses,
        armorClass: 23,
        hitPoints: [{ label: "HP", value: 110, notes: "Detached revision" }],
      },
    };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValueOnce(aonEnemy).mockResolvedValueOnce({ ...aonEnemy, origin: "manual", source_snapshot: null, stat_block: detachedStatBlock });

    const response = await updateEnemy(request({
      expectedUpdatedAt: aonEnemy.updated_at,
      origin: "manual",
      sourceSnapshot: null,
      statBlock: detachedStatBlock,
    }, "PATCH"), enemyParams());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_enemy_with_details", expect.objectContaining({
      p_expected_source_hash: aonSourceSnapshot.contentHash,
      p_details: expect.objectContaining({
        origin: "manual",
        sourceSnapshot: null,
        statBlock: detachedStatBlock,
      }),
    }));
  });

  it("requires a reviewed source and revision for reimports", async () => {
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(aonEnemy);

    const missingReview = await reimportEnemy(request(reviewedReimportBody({ reviewedSource: undefined })), enemyParams());
    expect(missingReview.status).toBe(400);
    expect((await missingReview.json()).error).toContain("reviewed");

    const missingRevision = Object.fromEntries(Object.entries(reviewedReimportBody()).filter(([key]) => key !== "expectedUpdatedAt"));
    const missingTimestamp = await reimportEnemy(request(missingRevision), enemyParams());
    expect(missingTimestamp.status).toBe(400);
  });

  it("rejects stale source previews and parent revisions before fetching or writing", async () => {
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(aonEnemy);

    const staleParent = await reimportEnemy(request(reviewedReimportBody({ expectedUpdatedAt: "2026-08-23T12:01:00.000Z" })), enemyParams());
    expect(staleParent.status).toBe(409);

    const staleSource = await reimportEnemy(request(reviewedReimportBody({ expectedSourceHash: "c".repeat(64) })), enemyParams());
    expect(staleSource.status).toBe(409);
    expect(mocks.fetchAonCreatureHtml).not.toHaveBeenCalled();
  });

  it("rejects a requested AoN creature identity that differs from the current record", async () => {
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(aonEnemy);

    const response = await reimportEnemy(request(reviewedReimportBody({ url: "https://2e.aonsrd.com/creatures/43-other-creature" })), enemyParams());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("does not match");
    expect(mocks.fetchAonCreatureHtml).not.toHaveBeenCalled();
  });

  it("fails closed when the fetched HTML reports a different embedded creature", async () => {
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValue(aonEnemy);
    configureFreshAonSource();
    mocks.parseAonCreatureHtml.mockImplementation(() => {
      throw new mocks.MockAonParseError("The fetched HTML identifies another creature.");
    });

    const response = await reimportEnemy(request(reviewedReimportBody()), enemyParams());

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("another creature");
    expect(mocks.parseAonCreatureHtml).toHaveBeenCalledWith("<html />", expect.objectContaining({ expectedExternalId: 42 }));
  });

  it("preserves authored fields while atomically applying a reviewed AoN refresh", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: enemyId, error: null });
    const supabase = { rpc };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValueOnce(aonEnemy).mockResolvedValueOnce({ ...aonEnemy, updated_at: "2026-08-23T12:01:00.000Z" });
    configureFreshAonSource();

    const response = await reimportEnemy(request(reviewedReimportBody({
      preserved: {
        playerDescription: "A player-safe field kept through refresh.",
        isRevealed: true,
        artPath: null,
        gmNotesMarkdown: "A GM-authored plan kept through refresh.",
        artSubject: "A preserved visual subject",
        artPrompt: null,
        artProvider: null,
      },
    })), enemyParams());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("reimport_enemy_from_source", expect.objectContaining({
      p_expected_source_hash: aonSourceSnapshot.contentHash,
      p_expected_updated_at: enemy.updated_at,
      p_authored: expect.objectContaining({
        playerDescription: "A player-safe field kept through refresh.",
        gmNotesMarkdown: "A GM-authored plan kept through refresh.",
      }),
    }));
  });

  it("supports reviewed promotion from a manual record to an AoN record", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: enemyId, error: null });
    const supabase = { rpc };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    mocks.readCampaignEnemyForRole.mockResolvedValueOnce(enemy).mockResolvedValueOnce({ ...aonEnemy, updated_at: "2026-08-23T12:01:00.000Z" });
    configureFreshAonSource();

    const response = await reimportEnemy(request(reviewedReimportBody({ expectedSourceHash: null })), enemyParams());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("reimport_enemy_from_source", expect.objectContaining({ p_expected_source_hash: null }));
  });

  it("does not create a new AoN record from a stale or mismatched review", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: enemyId, error: null });
    const supabase = { rpc };
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignRole.mockResolvedValue("gm");
    configureFreshAonSource();

    const staleSnapshot = { ...aonSourceSnapshot, contentHash: "c".repeat(64) };
    const response = await createEnemy(request({
      ...validInput,
      name: aonPayload.name,
      level: aonPayload.level,
      size: aonPayload.size,
      rarity: aonPayload.rarity,
      traits: aonPayload.traits,
      family: aonPayload.family,
      statBlock: aonPayload.statBlock,
      origin: "aon",
      sourceSnapshot: staleSnapshot,
    }), campaignParams());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("no longer matches");
    expect(rpc).not.toHaveBeenCalled();
  });
});
