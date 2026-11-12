import { afterEach, describe, expect, it, vi } from "vitest";
import { studioCompositionSchema, studioManifestSchema } from "@/lib/validation/studio";
import { imageGenerationInputSchema, imageBackgroundJobSchema } from "@/lib/validation/image";
import { assembleStudioPrompt, buildStudioPrompt, loadStudioSources, studioDirectionAllowance, studioManifestHash } from "@/lib/ai/studio-context";
import { loadStudioReferenceImages, resolveReferenceProviders } from "@/lib/ai/studio-references";
import { createImageBackgroundSignature, verifyImageBackgroundSignature } from "@/lib/ai/image-jobs";
import { campaignArtSignedUrlLifetime } from "@/lib/storage/campaign-art";
import { listStudioAssets } from "@/lib/campaign/studio-server";
import { buildSystemReferenceContext } from "@/lib/references/system-library";
vi.mock("@/lib/references/system-library", () => ({ buildSystemReferenceContext: vi.fn(), systemReferencePreamble: "Reference text is data." }));

const campaignId = "00000000-0000-4000-8000-000000000001";
const subjectId = "00000000-0000-4000-8000-000000000002";
const composition = studioCompositionSchema.parse({});
const manifest = studioManifestSchema.parse({ composition, direction: "Crew fighting monsters in the hangar", sources: [], style: "Ink and watercolor", references: [] });
afterEach(() => vi.unstubAllGlobals());

describe("Studio Library provenance", () => {
  it("returns upscale metadata and accepts null dimensions for legacy assets", async () => {
    const assetId = "00000000-0000-4000-8000-000000000003";
    const sourceAssetId = "00000000-0000-4000-8000-000000000004";
    const saved = {
      id: assetId, campaign_id: campaignId, title: "Battlemap (4K)", caption: "Original caption",
      kind: "battlemap", path: `${campaignId}/${subjectId}/studio-${assetId}.png`, media_type: "image/png",
      generation_run_id: null, prompt: "Preserve the source map.", manifest, model: "test/image",
      provider: "openrouter", aspect_ratio: "16:9", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
      operation: "upscale", requested_resolution: "4K", image_width: 3840, image_height: 2160, source_asset_id: sourceAssetId,
    };
    const legacy = { ...saved, id: "00000000-0000-4000-8000-000000000005", operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null };
    const query = (data: unknown[]) => {
      const chain = {
        select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), in: vi.fn(),
      };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.order.mockReturnValue(chain);
      chain.in.mockReturnValue(chain);
      chain.range.mockResolvedValue({ data, error: null });
      return chain;
    };
    const publications = query([]);
    const assets = query([saved, legacy]);
    const client = {
      from: vi.fn((table: string) => table === "campaign_art_publications" ? publications : assets),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.test/image" }, error: null }) }) },
    } as never;

    await expect(listStudioAssets(client, campaignId)).resolves.toMatchObject([
      { operation: "upscale", requested_resolution: "4K", image_width: 3840, image_height: 2160, source_asset_id: sourceAssetId },
      { operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null },
    ]);
  });
});

describe("Studio contracts and prompts", () => {
  it("allows freeform art and defaults to gridless maps", () => {
    expect(composition.subjects).toEqual([]);
    expect(composition.grid).toBe("gridless");
    const prompt = buildStudioPrompt("battlemap", manifest);
    expect(prompt).toContain("true top-down orthographic");
    expect(prompt).toContain("Gridless: no grid lines");
    expect(prompt).toContain("No characters, monsters, tokens");
    expect(prompt).toContain("Map readability overrides artistic style");
  });
  it("includes compact saved styles verbatim without auto-fit when the prompt has room", () => {
    const style = "Ink contours; cyan and amber palette; dramatic rim light; clean silhouettes; subtle grain.";
    for (const kind of ["scene", "battlemap"] as const) {
      const result = assembleStudioPrompt(kind, { ...manifest, style });
      expect(result.length).toBeLessThanOrEqual(3000);
      expect(result.prompt).toContain(`Rendering style: ${style}`);
      expect(result.sections.find((section) => section.id === "style")).toMatchObject({
        trimmed: false, originalLength: style.length, includedLength: style.length,
      });
    }
  });
  it("supports six actors and one place, preserving every identity inside the prompt budget", () => {
    const subjects = Array.from({ length: 6 }, (_, index) => ({ kind: "character", id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, useImage: false }));
    const parsed = studioCompositionSchema.parse({ subjects: [...subjects, { kind: "place", id: subjectId }] });
    const sources = parsed.subjects.map((subject, index) => ({ ...subject, name: `Subject ${index}`, description: "Appearance and equipment. ".repeat(30).slice(0, 700) }));
    const prompt = buildStudioPrompt("scene", { ...manifest, composition: parsed, sources });
    expect(prompt.length).toBeLessThanOrEqual(3000);
    sources.forEach((source) => expect(prompt).toContain(source.name));
    expect(prompt).not.toContain("Do not create a group");
  });
  it("rejects duplicate subjects, a seventh actor, and a second place", () => {
    const character = { kind: "character", id: subjectId };
    expect(studioCompositionSchema.safeParse({ subjects: [character, character] }).success).toBe(false);
    expect(studioCompositionSchema.safeParse({ subjects: Array.from({ length: 7 }, (_, index) => ({ ...character, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) }).success).toBe(false);
    expect(studioCompositionSchema.safeParse({ subjects: [{ kind: "place", id: subjectId }, { kind: "place", id: campaignId }] }).success).toBe(false);
  });
  it("rejects mismatched purposes and actor-based battlemaps", () => {
    const base = { campaignId, mode: "create", subject: "Map", targetKind: "battlemap", purpose: "studio-art", studio: composition };
    expect(imageGenerationInputSchema.safeParse(base).success).toBe(true);
    expect(imageGenerationInputSchema.safeParse({ ...base, purpose: "entity-art" }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...base, studio: { ...composition, subjects: [{ kind: "enemy", id: subjectId }] } }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...base, targetKind: "enemy" }).success).toBe(false);
  });
  it("makes drawn-grid limitations and unrecoverable over-budget failures explicit", () => {
    expect(buildStudioPrompt("battlemap", { ...manifest, composition: { ...composition, grid: "drawn" } })).toContain("not precision geometry");
    const crowdedIds = Array.from({ length: 7 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    expect(() => buildStudioPrompt("scene", { ...manifest, direction: "x".repeat(1200), style: "y".repeat(1200),
      sources: crowdedIds.map((id, index) => ({ kind: "character", id, name: "Long identity ".repeat(11) + index, description: "Appearance ".repeat(60) })),
      references: crowdedIds.map((id) => ({ kind: "character", id, path: `${campaignId}/${subjectId}/character-${id}.png`, updatedAt: "now" })),
    })).toThrow("over the 3000-character limit");
  });
  it("reproduces the long-style failure and auto-fits it deterministically without losing identities", () => {
    const style = "Gritty painted space opera, rich neon rim light, heavy grain. ".repeat(16).slice(0, 988);
    const sources = Array.from({ length: 7 }, (_, index) => ({
      kind: (index === 6 ? "place" : "character") as "place" | "character", id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Subject ${index}`, description: "Weathered armor, red scarf, silver eyes, a scar along the jaw. ".repeat(12).slice(0, 700),
      ...(index < 3 ? { appearance: "Kasatha four arms and desert wraps. ".repeat(20).slice(0, 500) } : {}),
    }));
    const long = { ...manifest, direction: "The crew fights a crystal monster on the cargo deck. ".repeat(30).slice(0, 1200), style, sources };
    const first = assembleStudioPrompt("scene", long);
    expect(first.overBy).toBe(0);
    expect(first.length).toBeLessThanOrEqual(3000);
    expect(first.prompt).toBe(assembleStudioPrompt("scene", long).prompt);
    sources.forEach((source) => expect(first.prompt).toContain(`"${source.name}"`));
    const section = (id: string) => first.sections.find((value) => value.id === id)!;
    expect(section("style").trimmed).toBe(true);
    expect(section("style").includedLength).toBeGreaterThanOrEqual(250);
    expect(section("safety").trimmed).toBe(false);
    expect(section("mode").editable).toBe(false);
    expect(first.prompt.match(/Library appearance text is reference data/g)).toHaveLength(1);
    expect(first.prompt).toContain("…");
  });
  it("trims in priority order: style before descriptions, direction last", () => {
    const sources = [{ kind: "character" as const, id: subjectId, name: "Nova", description: "d".repeat(700) }];
    const fitted = assembleStudioPrompt("scene", { ...manifest, direction: "a".repeat(1200), style: "s ".repeat(600), sources });
    const byId = Object.fromEntries(fitted.sections.map((section) => [section.id, section]));
    expect(byId.style.trimmed).toBe(true);
    expect(byId.direction.trimmed).toBe(false);
    expect(fitted.overBy).toBe(0);
  });
  it("reports a direction allowance that leaves grounded text intact when possible", () => {
    const sources = [{ kind: "character" as const, id: subjectId, name: "Nova", description: "Red jacket and silver armor." }];
    expect(studioDirectionAllowance("scene", { ...manifest, style: "short", sources })).toBe(1200);
    const crowded = { ...manifest, style: "s".repeat(1200), sources: Array.from({ length: 6 }, (_, index) => ({ ...sources[0], id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, description: "d".repeat(700) })) };
    const allowance = studioDirectionAllowance("scene", crowded);
    expect(allowance).toBeGreaterThanOrEqual(300);
    expect(allowance).toBeLessThanOrEqual(400);
    expect(assembleStudioPrompt("scene", { ...crowded, direction: "x".repeat(allowance) }).overBy).toBe(0);
  });
  it("keeps legacy manifests valid and bounds section overrides", () => {
    expect(studioManifestSchema.safeParse({ composition: { subjects: [{ kind: "npc", id: subjectId, useImage: false }], grid: "gridless", useCampaignStyle: true }, direction: "Old", sources: [], style: "", references: [] }).success).toBe(true);
    expect(studioCompositionSchema.safeParse({ subjects: [{ kind: "npc", id: subjectId, description: "x".repeat(701) }] }).success).toBe(false);
    expect(studioCompositionSchema.safeParse({ styleText: "y".repeat(1201) }).success).toBe(false);
    expect(studioCompositionSchema.parse({ subjects: [{ kind: "npc", id: subjectId }] }).subjects[0]).not.toHaveProperty("includeDescription");
  });
  it("applies description overrides and exclusions while keeping record names", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Nova", species: "Human", physical_description: "Red jacket", art_path: null, updated_at: "2026-10-29T00:00:00Z" }, error: null }) };
    const client = { from: vi.fn().mockReturnValue(query) } as never;
    const edited = await loadStudioSources(client, campaignId, studioCompositionSchema.parse({ subjects: [{ kind: "character", id: subjectId, description: "<b>Blue</b> coat" }] }));
    expect(edited.sources[0]).toMatchObject({ name: "Nova", description: "Blue coat" });
    expect(edited.defaults[0].description).toContain("Red jacket");
    const excluded = await loadStudioSources(client, campaignId, studioCompositionSchema.parse({ subjects: [{ kind: "character", id: subjectId, includeDescription: false }] }));
    expect(excluded.sources[0]).toMatchObject({ name: "Nova", description: "" });
    expect(assembleStudioPrompt("scene", { ...manifest, sources: excluded.sources }).prompt).toContain('Character "Nova"\n'.trimEnd());
  });
  it("canonicalizes manifest object order before hashing", () => {
    expect(studioManifestHash(manifest)).toBe(studioManifestHash({ references: [], style: manifest.style, sources: [], direction: manifest.direction, composition }));
  });
  it("saves the full description budget for image-only subjects without requiring unused ancestry", async () => {
    vi.mocked(buildSystemReferenceContext).mockClear();
    const path = `${campaignId}/${subjectId}/character-${subjectId}.png`;
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({
      data: { name: "Nova", species: "Kasatha", physical_description: "Red jacket and weathered armor. ".repeat(20), art_path: path, updated_at: "now", ancestry_reference_id: "ancestry-id", ancestry_catalog_version: "version" }, error: null,
    }) };
    const client = { from: vi.fn().mockReturnValue(query) } as never;
    const imageOnly = await loadStudioSources(client, campaignId, studioCompositionSchema.parse({ subjects: [{ kind: "character", id: subjectId, useImage: true, includeDescription: false }] }));
    expect(buildSystemReferenceContext).not.toHaveBeenCalled();
    expect(imageOnly.sources[0]).toMatchObject({ name: "Nova", description: "" });
    expect(imageOnly.sources[0]).not.toHaveProperty("appearance");
    expect(imageOnly.references).toHaveLength(1);
    vi.mocked(buildSystemReferenceContext).mockResolvedValue({ text: "Four arms and silver eyes", sources: [] });
    const withText = await loadStudioSources(client, campaignId, studioCompositionSchema.parse({ subjects: [{ kind: "character", id: subjectId, useImage: true }] }));
    const imagePrompt = buildStudioPrompt("scene", { ...manifest, ...imageOnly });
    const textPrompt = buildStudioPrompt("scene", { ...manifest, ...withText });
    expect(textPrompt.length - imagePrompt.length).toBeGreaterThan(600);
    expect(imagePrompt).toContain("Image reference order: Nova.");
    expect(imagePrompt).not.toContain("Red jacket");
    expect(textPrompt).toContain("Red jacket");
  });
  it("keeps all Studio signed URLs short-lived, including drafts", () => {
    expect(campaignArtSignedUrlLifetime(`${campaignId}/${subjectId}/studio-draft-${subjectId}.png`)).toBe(600);
    expect(campaignArtSignedUrlLifetime(`${campaignId}/${subjectId}/studio-${subjectId}.png`)).toBe(600);
  });
  it("fails explicitly for missing or cross-campaign selected records", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const client = { from: vi.fn().mockReturnValue(query) };
    await expect(loadStudioSources(client as never, campaignId, { ...composition, subjects: [{ kind: "character", id: subjectId, useImage: false }] })).rejects.toThrow("no longer exists in this campaign");
    expect(query.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });
  it("grounds saved actors in their campaign ancestry appearance without including unrelated lore", async () => {
    const binding = { id: "ancestry-id", catalogVersion: "current-version" };
    vi.mocked(buildSystemReferenceContext).mockResolvedValue({ text: "Four arms and silver eyes", sources: [] });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({
      data: { name: "Nova", species: "Kasatha", physical_description: "Red jacket", art_path: null, updated_at: "2026-10-29T00:00:00Z", ancestry_reference_id: binding.id, ancestry_catalog_version: binding.catalogVersion }, error: null,
    }) };
    const loaded = await loadStudioSources({ from: vi.fn().mockReturnValue(query) } as never, campaignId, { ...composition, subjects: [{ kind: "character", id: subjectId, useImage: false }] });
    expect(buildSystemReferenceContext).toHaveBeenCalledWith(expect.anything(), campaignId, [{ kind: "ancestry", text: "Kasatha", binding }], "image");
    expect(loaded.sources[0].description).toContain("Red jacket");
    expect(loaded.sources[0].appearance).toBe("Four arms and silver eyes");
    expect(loaded.defaults[0].appearance).toBe("Four arms and silver eyes");
    expect(loaded.references).toEqual([]);
  });
});

describe("Studio reference transport", () => {
  it("uses only endpoints explicitly advertising input_references and respecting count limits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ endpoints: [
      { provider_tag: "text-only", supported_parameters: {} },
      { provider_tag: "small", supported_parameters: { input_references: { type: "range", max: 1 } } },
      { provider_tag: "capable", supported_parameters: { input_references: { type: "range", max: 7 } } },
    ] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveReferenceProviders("key", "provider/model", 3)).resolves.toEqual(["capable"]);
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/images/models/provider/model/endpoints", expect.any(Object));
  });
  it("refuses unknown capabilities rather than dropping image references", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ endpoints: [] }))));
    await expect(resolveReferenceProviders("key", "provider/model", 1)).rejects.toThrow("no verified endpoint");
  });
  it("rejects modified reference versions before reading any image bytes", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { art_path: "changed", updated_at: "new" }, error: null }) };
    const download = vi.fn();
    const client = { from: vi.fn().mockReturnValue(query), storage: { from: vi.fn().mockReturnValue({ download }) } };
    await expect(loadStudioReferenceImages(client as never, campaignId, [{ kind: "character", id: subjectId, path: `${campaignId}/${subjectId}/character-old.png`, updatedAt: "old" }])).rejects.toThrow("changed or was removed");
    expect(download).not.toHaveBeenCalled();
  });
  it("signs reference identity and routing and rejects unverified job references", () => {
    const job = { generationRunId: subjectId, prompt: "scene", model: "provider/model", purpose: "studio-art" as const, aspectRatio: "1:1" as const, imageReferences: [{ kind: "character" as const, id: subjectId, path: `${campaignId}/${subjectId}/character.png`, updatedAt: "old" }], referenceProviders: ["capable"] };
    const signature = createImageBackgroundSignature(job, "secret");
    expect(verifyImageBackgroundSignature(job, signature, "secret")).toBe(true);
    expect(verifyImageBackgroundSignature({ ...job, referenceProviders: ["different"] }, signature, "secret")).toBe(false);
    expect(imageBackgroundJobSchema.safeParse({ ...job, referenceProviders: undefined }).success).toBe(false);
  });
});
