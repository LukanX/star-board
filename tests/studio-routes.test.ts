import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireCampaignGM: vi.fn(), createCampaignArtSignedUrl: vi.fn(), verifyReferences: vi.fn() }));
vi.mock("@/lib/ai/studio-references", () => ({ loadStudioReferenceImages: mocks.verifyReferences }));
vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/storage/campaign-art", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/storage/campaign-art")>(),
  createCampaignArtSignedUrl: mocks.createCampaignArtSignedUrl,
}));

import { POST as preview } from "@/app/api/campaigns/[campaignId]/studio/preview/route";
import { GET as subjects } from "@/app/api/campaigns/[campaignId]/studio/subjects/route";
import { GET as library } from "@/app/api/campaigns/[campaignId]/studio/route";
import { listStudioAssets } from "@/lib/campaign/studio-server";
import { StudioError } from "@/lib/ai/studio-context";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const characterIds = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`);
const params = { params: Promise.resolve({ campaignId }) };

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "ilike", "order", "in"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null });
  chain.range = vi.fn().mockResolvedValue({ data: result, error: null });
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: result, error: null });
  return chain;
}

function previewClient(style: string, description = "Red jacket and silver armor", name = "Nova") {
  return { from: vi.fn((table: string) => table === "campaigns"
    ? query({ visual_style: style })
    : query({ name, physical_description: description, art_path: null, updated_at: "2026-10-29T00:00:00Z" })) };
}

function previewRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/studio/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    campaignId, purpose: "studio-art", targetKind: "scene", mode: "create", subject: "Crew fights a monster", studio: {}, ...body,
  }) });
}

describe("Studio preview route", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("validates before authorization and denies players", async () => {
    expect((await preview(new Request("http://localhost", { method: "POST", body: "{" }), params)).status).toBe(400);
    expect((await preview(previewRequest({ targetKind: "npc" }), params)).status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
    mocks.requireCampaignGM.mockResolvedValue(null);
    expect((await preview(previewRequest({}), params)).status).toBe(403);
  });

  it("returns the trimmed prompt, labeled sections and grounded defaults for the reported long-style failure", async () => {
    const style = "Gritty painted space opera with neon rim light and film grain. ".repeat(16).slice(0, 988);
    mocks.requireCampaignGM.mockResolvedValue({ supabase: previewClient(style, "d".repeat(700)), user: { id: userId } });
    const response = await preview(previewRequest({
      subject: "x".repeat(1200),
      studio: { subjects: characterIds.map((id) => ({ kind: "character", id })) },
    }), params);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.length).toBeLessThanOrEqual(3000);
    expect(payload.overBy).toBe(0);
    expect(payload.sections.find((section: { id: string }) => section.id === "style")).toMatchObject({ trimmed: true, originalLength: 988, editable: true });
    expect(payload.sections.find((section: { id: string }) => section.id === "safety")).toMatchObject({ trimmed: false, editable: false });
    expect(payload.defaults.style).toBe(style);
    expect(payload.defaults.subjects).toHaveLength(6);
    expect(payload.directionMissing).toBe(false);
  });

  it("previews before a direction exists and applies style and description overrides", async () => {
    mocks.requireCampaignGM.mockResolvedValue({ supabase: previewClient("Saved style"), user: { id: userId } });
    const response = await preview(previewRequest({
      subject: "",
      studio: { styleText: "Edited ink wash", subjects: [{ kind: "character", id: characterIds[0], description: "Blue coat" }] },
    }), params);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.directionMissing).toBe(true);
    expect(payload.prompt).toContain("Rendering style: Edited ink wash");
    expect(payload.prompt).toContain('Character "Nova": Blue coat');
    expect(payload.defaults).toMatchObject({ style: "Saved style", subjects: [{ name: "Nova", description: "Red jacket and silver armor" }] });
  });

  it("returns the full breakdown with 422 when locked text and identities cannot fit", async () => {
    const client = { from: vi.fn((table: string) => table === "campaigns" ? query({ visual_style: "s" }) : query({
      name: "N".repeat(160), description: "d".repeat(700), physical_description: "d".repeat(700),
      art_path: `${campaignId}/${userId}/npc-${characterIds[0]}.png`, updated_at: "2026-10-29T00:00:00Z",
    })) };
    mocks.requireCampaignGM.mockResolvedValue({ supabase: client, user: { id: userId } });
    const placeId = `00000000-0000-4000-8000-${"9".repeat(12)}`;
    const response = await preview(previewRequest({
      subject: "x".repeat(1200),
      studio: { subjects: [...characterIds.map((id) => ({ kind: "npc", id, useImage: true })), { kind: "place", id: placeId, useImage: true }] },
    }), params);
    const payload = await response.json();
    expect(response.status).toBe(422);
    expect(payload.overBy).toBeGreaterThan(0);
    expect(payload.error).toContain("over the 3000-character limit");
    expect(payload.sections.find((section: { id: string }) => section.id === "references")).toMatchObject({ editable: false });
    expect(payload.prompt.length).toBe(payload.length);
  });
  it("verifies image bytes only on explicit preflight and identifies unavailable references", async () => {
    const path = `${campaignId}/${userId}/character-${characterIds[0]}.png`;
    const client = { from: vi.fn((table: string) => table === "campaigns" ? query({ visual_style: "" }) : query({
      name: "Nova", description: "Red armor", art_path: path, updated_at: "now",
    })) };
    mocks.requireCampaignGM.mockResolvedValue({ supabase: client, user: { id: userId } });
    const body = { studio: { subjects: [{ kind: "character", id: characterIds[0], useImage: true, includeDescription: false }] } };
    expect((await preview(previewRequest(body), params)).status).toBe(200);
    expect(mocks.verifyReferences).not.toHaveBeenCalled();
    mocks.verifyReferences.mockRejectedValueOnce(new StudioError("Image unavailable", 503, `character:${characterIds[0]}`));
    const failed = await preview(previewRequest({ ...body, verifyReferences: true }), params);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "Image unavailable", referenceSubject: `character:${characterIds[0]}` });
    expect(mocks.verifyReferences).toHaveBeenCalledWith(client, campaignId, [expect.objectContaining({ path })]);
  });
  it("rejects invalid preflight flags", async () => {
    expect((await preview(previewRequest({ verifyReferences: "true" }), params)).status).toBe(400);
    expect(mocks.requireCampaignGM).not.toHaveBeenCalled();
  });
});

describe("Studio subjects and library routes", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("adds short-lived thumbnails for GMs and degrades to placeholders when signing fails", async () => {
    const rows = [
      { id: characterIds[0], name: "Nova", art_path: `${campaignId}/${userId}/character-a.png`, updated_at: "now" },
      { id: characterIds[1], name: "Rex", art_path: `${campaignId}/${userId}/character-b.png`, updated_at: "now" },
      { id: characterIds[2], name: "Ash", art_path: null, updated_at: "now" },
    ];
    mocks.requireCampaignGM.mockResolvedValue({ supabase: { from: vi.fn(() => query(rows)) }, user: { id: userId } });
    mocks.createCampaignArtSignedUrl.mockResolvedValueOnce("https://storage.example/a").mockRejectedValueOnce(new Error("missing"));
    const response = await subjects(new Request(`http://localhost/api?kind=character`), params);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.subjects.map((row: { thumbnailUrl: string | null }) => row.thumbnailUrl)).toEqual(["https://storage.example/a", null, null]);
    expect(payload.subjects.map((row: { hasReferenceImage: boolean }) => row.hasReferenceImage)).toEqual([true, true, false]);
    expect(mocks.createCampaignArtSignedUrl).toHaveBeenCalledWith(expect.anything(), rows[0].art_path, 600);
    mocks.requireCampaignGM.mockResolvedValue(null);
    expect((await subjects(new Request(`http://localhost/api?kind=character`), params)).status).toBe(403);
  });
  it("resolves a mention by exact campaign-scoped ID and excludes externally linked art from defaults", async () => {
    const chain = query([{ id: characterIds[0], name: "Nova", art_path: "https://example.test/image.png", updated_at: "now" }]);
    mocks.requireCampaignGM.mockResolvedValue({ supabase: { from: vi.fn(() => chain) }, user: { id: userId } });
    const response = await subjects(new Request(`http://localhost/api?kind=character&id=${characterIds[0]}`), params);
    expect(response.status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(chain.eq).toHaveBeenCalledWith("id", characterIds[0]);
    expect((await response.json()).subjects[0].hasReferenceImage).toBe(false);
  });

  it("rejects unknown library filters before reading assets", async () => {
    const from = vi.fn();
    mocks.requireCampaignGM.mockResolvedValue({ supabase: { from }, user: { id: userId } });
    expect((await library(new Request("http://localhost/api?filter=everything"), params)).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("filters by kind or sharing server-side so pagination stays correct", async () => {
    const publications = query([]);
    const assets = query([]);
    const client = { from: vi.fn((table: string) => table === "campaign_art_publications" ? publications : assets) };
    await expect(listStudioAssets(client as never, campaignId, 0, "shared")).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalledWith("campaign_art_assets");
    await listStudioAssets(client as never, campaignId, 24, "battlemap");
    expect(assets.eq).toHaveBeenCalledWith("kind", "battlemap");
    expect(assets.range).toHaveBeenCalledWith(24, 47);
  });
});
