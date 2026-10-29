import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceError, searchReferences } from "@/lib/references/catalog";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(), getCampaignRole: vi.fn(), getCampaignMembership: vi.fn(),
  readSystemLibrary: vi.fn(), readSystemReferenceSettings: vi.fn(), inspectSystemReferenceContext: vi.fn(),
  loadCharacterPortraitAccess: vi.fn(), loadCampaignLibraryAccess: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", () => mocks);
vi.mock("@/lib/references/system-library", () => mocks);
vi.mock("@/lib/ai/character-portrait-access", () => mocks);
vi.mock("@/lib/references/library-access", async (original) => ({
  ...await original<typeof import("@/lib/references/library-access")>(),
  loadCampaignLibraryAccess: mocks.loadCampaignLibraryAccess,
}));

import { PUT as saveReference } from "@/app/api/campaigns/[campaignId]/system-references/[referenceId]/route";
import { GET as getSettings, PUT as saveSettings } from "@/app/api/campaigns/[campaignId]/system-references/route";
import { POST as previewContext } from "@/app/api/campaigns/[campaignId]/references/context/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const characterId = "00000000-0000-4000-8000-000000000002";
const ancestry = searchReferences("ancestry", "Kasatha")[0].binding;
const classBinding = searchReferences("class", "Witchwarper")[0].binding;
const campaign = { params: Promise.resolve({ campaignId }) };
const reference = { params: Promise.resolve({ campaignId, referenceId: ancestry.id }) };
const content = { expectedRevision: 0, appearance: "User-entered appearance", lore: "", traitContext: "", sourceNotes: "" };
const settings = { appearance: false, lore: false, creatureTraits: false };
const selection = { kind: "ancestry", binding: ancestry };
const request = (body?: unknown) => new Request("http://localhost/api/system-test", {
  method: body === undefined ? "GET" : "POST",
  ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
});
const rpc = vi.fn();
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));
const supabase = { rpc, from };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: "viewer" }, supabase });
  mocks.getCampaignRole.mockResolvedValue("gm");
  mocks.getCampaignMembership.mockResolvedValue({ role: "player" });
  mocks.loadCampaignLibraryAccess.mockResolvedValue({ owner: true, member: true, canEdit: true });
  mocks.readSystemLibrary.mockResolvedValue([{ kind: "ancestry" }]);
  mocks.readSystemReferenceSettings.mockResolvedValue(settings);
  mocks.inspectSystemReferenceContext.mockResolvedValue({ text: "Context", sources: [], availability: [] });
  rpc.mockResolvedValue({ data: 1, error: null });
  upsert.mockResolvedValue({ error: null });
});

describe("campaign library save route", () => {
  it("validates JSON and content before authentication", async () => {
    expect((await saveReference(new Request("http://localhost", { method: "PUT", body: "{" }), reference)).status).toBe(400);
    expect((await saveReference(request({ ...content, appearance: "x".repeat(4001) }), reference)).status).toBe(400);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("requires authentication, an existing entry and kind-appropriate content", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    expect((await saveReference(request(content), reference)).status).toBe(401);
    mocks.readSystemLibrary.mockResolvedValueOnce([]);
    expect((await saveReference(request(content), reference)).status).toBe(404);
    expect((await saveReference(request({ ...content, traitContext: "Wrong field" }), reference)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves through the checked RPC and returns private, noncached revision metadata", async () => {
    const response = await saveReference(request(content), reference);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ revision: 1 });
    expect(rpc).toHaveBeenCalledWith("save_system_reference", {
      p_campaign_id: campaignId, p_reference_id: ancestry.id, p_expected_revision: 0, p_appearance: content.appearance,
      p_lore: "", p_trait_context: "", p_source_notes: "",
    });
  });
  it.each([["42501", 403], ["PT409", 409]])("maps database %s without claiming success", async (code, status) => {
    rpc.mockResolvedValueOnce({ error: { code } });
    expect((await saveReference(request(content), reference)).status).toBe(status);
  });
  it("requires membership and effective editor permission before loading campaign content", async () => {
    mocks.loadCampaignLibraryAccess.mockResolvedValueOnce({ owner: false, member: true, canEdit: false });
    expect((await saveReference(request(content), reference)).status).toBe(403);
    mocks.loadCampaignLibraryAccess.mockResolvedValueOnce({ owner: false, member: false, canEdit: false });
    expect((await saveReference(request(content), reference)).status).toBe(403);
    expect(mocks.readSystemLibrary).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports storage failure without exposing provider/database detail", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "private database detail" } });
    const response = await saveReference(request(content), reference);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database detail");
  });
});

describe("campaign System context settings routes", () => {
  it("requires authenticated membership to read and GM permission to write", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    expect((await getSettings(request(), campaign)).status).toBe(401);
    mocks.getCampaignRole.mockResolvedValueOnce(null);
    expect((await getSettings(request(), campaign)).status).toBe(403);
    mocks.getCampaignRole.mockResolvedValueOnce("player");
    expect((await getSettings(request(), campaign)).status).toBe(200);
    mocks.getCampaignRole.mockResolvedValueOnce("player");
    expect((await saveSettings(request(settings), campaign)).status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("validates all three independent switches and preserves explicit false values", async () => {
    expect((await saveSettings(request({ appearance: true }), campaign)).status).toBe(400);
    const response = await saveSettings(request({ ...settings, lore: true }), campaign);
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("campaign_system_reference_settings");
    expect(upsert).toHaveBeenCalledWith({
      campaign_id: campaignId, updated_by: "viewer", updated_at: expect.any(String),
      appearance: false, lore: true, creature_traits: false,
    });
  });
  it("reports failed writes and reads explicitly", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "XX000" } });
    expect((await saveSettings(request(settings), campaign)).status).toBe(503);
    mocks.readSystemReferenceSettings.mockRejectedValueOnce(new Error("DB failure"));
    expect((await getSettings(request(), campaign)).status).toBe(503);
  });
});

describe("reference context preview route", () => {
  const input = { purpose: "text", selections: [selection] };
  it("validates bounded, unique explicit selections before authorization", async () => {
    for (const body of [{ ...input, selections: [selection, selection] }, { ...input, purpose: "rules" }, { ...input, extra: true }]) {
      expect((await previewContext(request(body), campaign)).status).toBe(400);
    }
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("requires authenticated campaign membership", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    expect((await previewContext(request(input), campaign)).status).toBe(401);
    mocks.getCampaignMembership.mockResolvedValueOnce(null);
    expect((await previewContext(request(input), campaign)).status).toBe(403);
    expect(mocks.inspectSystemReferenceContext).not.toHaveBeenCalled();
  });
  it("returns source metadata and size, not raw library text", async () => {
    const response = await previewContext(request(input), campaign);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ sources: [], promptCharacters: 7, availability: [] });
    expect(mocks.inspectSystemReferenceContext).toHaveBeenCalledWith(supabase, campaignId, [selection], "text");
  });
  it("uses saved character bindings instead of supplied draft identity", async () => {
    const saved = searchReferences("ancestry", "Android")[0].binding;
    mocks.loadCharacterPortraitAccess.mockResolvedValue({ access: { character: {
      ancestry_reference_id: saved.id, ancestry_catalog_version: saved.catalogVersion,
      class_reference_id: classBinding.id, class_catalog_version: classBinding.catalogVersion,
    } } });
    expect((await previewContext(request({ ...input, characterId, purpose: "image" }), campaign)).status).toBe(200);
    expect(mocks.inspectSystemReferenceContext).toHaveBeenLastCalledWith(supabase, campaignId, [{ kind: "ancestry", binding: saved }], "image");
    expect((await previewContext(request({ ...input, characterId }), campaign)).status).toBe(200);
    expect(mocks.inspectSystemReferenceContext).toHaveBeenLastCalledWith(supabase, campaignId, [
      { kind: "ancestry", binding: saved }, { kind: "class", binding: classBinding },
    ], "text");
  });
  it.each([["forbidden", 403], ["not-found", 404]])("preserves saved character %s authorization", async (failure, status) => {
    mocks.loadCharacterPortraitAccess.mockResolvedValue({ failure });
    expect((await previewContext(request({ ...input, characterId }), campaign)).status).toBe(status);
    expect(mocks.inspectSystemReferenceContext).not.toHaveBeenCalled();
  });
  it.each([400, 409, 503] as const)("propagates bounded reference errors with status %i", async (status) => {
    mocks.inspectSystemReferenceContext.mockRejectedValueOnce(new ReferenceError("Context is unavailable.", status));
    const response = await previewContext(request(input), campaign);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Context is unavailable." });
  });
});
