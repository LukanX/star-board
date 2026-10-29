import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn(), getCampaignMembership: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => mocks);
import { GET } from "@/app/api/campaigns/[campaignId]/references/route";
import { searchReferences } from "@/lib/references/catalog";
import artifact from "@/lib/references/catalog.generated.json";
import traitArtifact from "@/lib/references/creature-traits.generated.json";
import { referenceSearchResponseSchema } from "@/lib/validation/reference";
const params = { params: Promise.resolve({ campaignId: "00000000-0000-4000-8000-000000000001" }) };
const request = (query: string) => new Request(`http://localhost/api/references?${query}`);

describe("reference lookup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {
      rpc: vi.fn(async (_name, { p_ids }) => ({ error: null, data: artifact.records.filter((record) => p_ids.includes(record.id)).map((record) => ({
        reference_id: record.id, kind: record.kind, name: record.name, catalog_version: artifact.catalogVersion, source_url: record.sourceUrl, publication: record.publication,
        revision: 0, appearance: "", lore: "", trait_context: "", source_notes: "", updated_at: null,
      })).concat(traitArtifact.records.filter((record) => p_ids.includes(record.id)).map((record) => ({
        reference_id: record.id, kind: record.kind, name: record.name, catalog_version: traitArtifact.catalogVersion, source_url: record.sourceUrl, publication: record.slug,
        revision: 0, appearance: "", lore: "", trait_context: "", source_notes: "", updated_at: null,
      }))) })),
    }, user: { id: "user" } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player" });
  });
  it("requires authentication and membership", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    expect((await GET(request("kind=ancestry"), params)).status).toBe(401);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "user" } });
    mocks.getCampaignMembership.mockResolvedValue(null);
    expect((await GET(request("kind=ancestry"), params)).status).toBe(403);
  });
  it("allows a campaign player to search without AI credentials", async () => {
    const response = await GET(request("kind=ancestry&q=android"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).results[0].name).toBe("Android");
  });
  it("accepts custom class text up to the existing editor limit", async () => {
    const response = await GET(request(`kind=class&q=${"x".repeat(160)}`), params);
    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([]);
  });
  it.each(["kind=ancestry&limit=21", "kind=spell", "kind=class&unexpected=1", "kind=class&id=invalid", "kind=class&offset=0", "kind=creature_trait&offset=-1", `kind=class&q=${"x".repeat(161)}`])("rejects invalid query %s", async (query) => {
    expect((await GET(request(query), params)).status).toBe(400);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("pages through every creature trait and excludes already-entered names before paging", async () => {
    let offset: number | null = 0;
    const ids: string[] = [];
    while (offset !== null) {
      const query = new URLSearchParams({ kind: "creature_trait", offset: String(offset), exclude: "aBeRrAtIoN,Acid" });
      const response = await GET(request(query.toString()), params);
      expect(response.status).toBe(200);
      const body = referenceSearchResponseSchema.parse(await response.json());
      expect(body.results.length).toBeLessThanOrEqual(20);
      ids.push(...body.results.map((entry) => entry.binding.id));
      expect(body.nextOffset).not.toBeUndefined();
      offset = body.nextOffset ?? null;
    }
    const expected = traitArtifact.records.filter((record) => !["aberration", "acid"].includes(record.name.toLowerCase())).map((record) => record.id);
    expect(ids).toEqual(expected);
    expect(ids).toContain("sf2e.creature-traits.zombie");
    expect(new Set(ids).size).toBe(expected.length);
  });
  it("supports exact binding lookup and unavailable-version errors", async () => {
    const { binding } = searchReferences("ancestry", "Vesk")[0];
    const query = new URLSearchParams({ kind: "ancestry", ...binding });
    expect((await (await GET(request(query.toString()), params)).json()).results).toHaveLength(1);
    query.set("catalogVersion", "old");
    expect((await GET(request(query.toString()), params)).status).toBe(409);
  });
});
