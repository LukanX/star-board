import { describe, expect, it, vi } from "vitest";
import { buildImageEditPrompt, loadEditSourceImage, resolveEditSource } from "@/lib/ai/image-edit";
import { studioManifestHash } from "@/lib/ai/studio-context";
import { imageGenerationInputSchema, imagePromptMaxLength } from "@/lib/validation/image";
import { studioManifestSchema } from "@/lib/validation/studio";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";
const entityId = "00000000-0000-4000-8000-000000000004";
const assetId = "00000000-0000-4000-8000-000000000005";
const path = (name: string) => `${campaignId}/${userId}/${name}`;

const manifest = studioManifestSchema.parse({
  composition: { subjects: [], grid: "gridless", useCampaignStyle: false },
  direction: "A reactor corridor", sources: [], references: [], style: "",
});

function query(result: { data: unknown; error?: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }) };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function client(tables: Record<string, ReturnType<typeof query>>) {
  return { from: vi.fn((table: string) => tables[table]) } as never;
}

const base = { supabase: undefined as never, campaignId, userId, role: "gm" as const };

describe("image edit prompts", () => {
  it("wraps the instruction in a preserve-everything-else prompt within the image limit", () => {
    const prompt = buildImageEditPrompt("  add rain  ");
    expect(prompt).toContain("Edit the attached image");
    expect(prompt).toContain("add rain");
    expect(buildImageEditPrompt("x".repeat(600)).length).toBeLessThanOrEqual(imagePromptMaxLength);
  });
});

describe("edit request validation", () => {
  const request = { campaignId, mode: "refine", operation: "edit", targetKind: "npc" };

  it("requires edit details for edit operations and forbids them otherwise", () => {
    expect(imageGenerationInputSchema.safeParse({ ...request }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...request, edit: { instruction: "Add rain", source: { type: "saved-art", entityId } } }).success).toBe(true);
    expect(imageGenerationInputSchema.safeParse({ ...request, operation: "generate", subject: "Broker", edit: { instruction: "Add rain", source: { type: "saved-art", entityId } } }).success).toBe(false);
  });

  it("requires a subject for non-edit requests and a parent only for redo and edit", () => {
    expect(imageGenerationInputSchema.safeParse({ campaignId, mode: "create", targetKind: "npc" }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ campaignId, mode: "create", targetKind: "npc", subject: "Broker", parentRunId: runId }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ campaignId, mode: "refine", operation: "redo", targetKind: "npc", subject: "Broker", parentRunId: runId }).success).toBe(true);
  });

  it("keeps edit sources on the right surface", () => {
    const studio = { campaignId, mode: "refine", operation: "edit", targetKind: "scene", purpose: "studio-art" };
    expect(imageGenerationInputSchema.safeParse({ ...studio, edit: { instruction: "Add rain", source: { type: "studio-asset", assetId } } }).success).toBe(true);
    expect(imageGenerationInputSchema.safeParse({ ...studio, edit: { instruction: "Add rain", source: { type: "draft", generationRunId: runId } } }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...studio, edit: { instruction: "Add rain", source: { type: "draft", generationRunId: runId, manifest } } }).success).toBe(true);
    expect(imageGenerationInputSchema.safeParse({ ...request, edit: { instruction: "Add rain", source: { type: "studio-asset", assetId } } }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...request, targetKind: "scene", purpose: "studio-art", edit: { instruction: "Add rain", source: { type: "saved-art", entityId } } }).success).toBe(false);
  });

  it("binds saved character art to the selected character and bounds the instruction", () => {
    const character = { ...request, targetKind: "character", characterId: entityId };
    expect(imageGenerationInputSchema.safeParse({ ...character, edit: { instruction: "Add rain", source: { type: "saved-art", entityId } } }).success).toBe(true);
    expect(imageGenerationInputSchema.safeParse({ ...character, edit: { instruction: "Add rain", source: { type: "saved-art", entityId: runId } } }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...request, edit: { instruction: "x".repeat(601), source: { type: "saved-art", entityId } } }).success).toBe(false);
  });
});

describe("resolveEditSource", () => {
  const draftEdit = { instruction: "Add rain", source: { type: "draft" as const, generationRunId: runId } };

  it("reads a draft path from the requester's completed run, never from the client", async () => {
    const runs = query({ data: { id: runId, status: "complete", image_path: path("image-run.png"), purpose: "entity-art", target_kind: "npc", target_character_id: null, studio_manifest_hash: null } });
    const result = await resolveEditSource({ ...base, supabase: client({ ai_generation_runs: runs }), input: { targetKind: "npc", purpose: "entity-art" }, edit: draftEdit });
    expect(result).toEqual({ path: path("image-run.png"), kind: "draft", parentRunId: runId, manifest: undefined });
    expect(runs.eq).toHaveBeenCalledWith("requested_by", userId);
    expect(runs.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });

  it.each([
    ["missing", null],
    ["unfinished", { id: runId, status: "running", image_path: null, purpose: "entity-art", target_kind: "npc", target_character_id: null }],
    ["a different target", { id: runId, status: "complete", image_path: path("image-run.png"), purpose: "entity-art", target_kind: "faction", target_character_id: null }],
  ])("rejects a draft that is %s", async (_label, data) => {
    const supabase = client({ ai_generation_runs: query({ data }) });
    await expect(resolveEditSource({ ...base, supabase, input: { targetKind: "npc", purpose: "entity-art" }, edit: draftEdit })).rejects.toMatchObject({ status: 404 });
  });

  it("requires a Studio draft manifest that matches the recorded hash", async () => {
    const run = { id: runId, status: "complete", image_path: path("studio-draft-run.png"), purpose: "studio-art", target_kind: "scene", target_character_id: null, studio_manifest_hash: studioManifestHash(manifest) };
    const input = { targetKind: "scene" as const, purpose: "studio-art" as const };
    const ok = await resolveEditSource({ ...base, supabase: client({ ai_generation_runs: query({ data: run }) }), input, edit: { ...draftEdit, source: { ...draftEdit.source, manifest } } });
    expect(ok.manifest).toEqual(manifest);
    const changed = { ...manifest, direction: "Something else" };
    await expect(resolveEditSource({ ...base, supabase: client({ ai_generation_runs: query({ data: run }) }), input, edit: { ...draftEdit, source: { ...draftEdit.source, manifest: changed } } }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("resolves saved entity art from the record and rejects external or missing art", async () => {
    const edit = { instruction: "Add rain", source: { type: "saved-art" as const, entityId } };
    const input = { targetKind: "npc" as const, purpose: "entity-art" as const };
    const records = query({ data: { art_path: path("npc-saved.png") } });
    const supabase = client({ npcs: records });
    await expect(resolveEditSource({ ...base, supabase, input, edit })).resolves.toMatchObject({ path: path("npc-saved.png"), kind: "saved-art" });
    expect(records.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    await expect(resolveEditSource({ ...base, supabase: client({ npcs: query({ data: { art_path: "https://example.com/a/b.png" } }) }), input, edit })).rejects.toMatchObject({ status: 400 });
    await expect(resolveEditSource({ ...base, supabase: client({ npcs: query({ data: { art_path: null } }) }), input, edit })).rejects.toMatchObject({ status: 400 });
  });

  it("lets a player edit only their saved character portrait", async () => {
    const supabase = client({ characters: query({ data: { art_path: path("character-saved.png") } }) });
    const character = { targetKind: "character" as const, purpose: "entity-art" as const, characterId: entityId };
    await expect(resolveEditSource({ ...base, role: "player", supabase, input: character, edit: { instruction: "Add rain", source: { type: "saved-art", entityId } } })).resolves.toMatchObject({ kind: "saved-art" });
    await expect(resolveEditSource({ ...base, role: "player", supabase: client({ npcs: query({ data: { art_path: path("npc-saved.png") } }) }), input: { targetKind: "npc", purpose: "entity-art" }, edit: { instruction: "Add rain", source: { type: "saved-art", entityId } } }))
      .rejects.toMatchObject({ status: 403 });
  });

  it("resolves a Studio library asset with its manifest and requires a matching kind", async () => {
    const asset = { path: path(`studio-${assetId}.png`), kind: "scene", manifest };
    const edit = { instruction: "Add rain", source: { type: "studio-asset" as const, assetId } };
    const input = { targetKind: "scene" as const, purpose: "studio-art" as const };
    await expect(resolveEditSource({ ...base, supabase: client({ campaign_art_assets: query({ data: asset }) }), input, edit })).resolves.toMatchObject({ kind: "studio-asset", manifest });
    await expect(resolveEditSource({ ...base, supabase: client({ campaign_art_assets: query({ data: { ...asset, kind: "battlemap" } }) }), input, edit })).rejects.toMatchObject({ status: 404 });
    await expect(resolveEditSource({ ...base, role: "player", supabase: client({ campaign_art_assets: query({ data: asset }) }), input, edit })).rejects.toMatchObject({ status: 403 });
  });
});

describe("loadEditSourceImage", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const storage = (data: Blob | null, error: unknown = null) => ({ storage: { from: () => ({ download: vi.fn().mockResolvedValue({ data, error }) }) } }) as never;

  it("returns a data URL for a valid campaign image", async () => {
    const [reference] = await loadEditSourceImage(storage(new Blob([png], { type: "image/png" })), campaignId, path("image-run.png"));
    expect(reference.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects paths outside the campaign, bad signatures, wrong types and oversized files", async () => {
    const valid = new Blob([png], { type: "image/png" });
    await expect(loadEditSourceImage(storage(valid), campaignId, `00000000-0000-4000-8000-0000000000ff/${userId}/a.png`)).rejects.toThrow();
    await expect(loadEditSourceImage(storage(new Blob([new Uint8Array(12)], { type: "image/png" })), campaignId, path("a.png"))).rejects.toThrow(/invalid image data/);
    await expect(loadEditSourceImage(storage(new Blob([png], { type: "image/gif" })), campaignId, path("a.gif"))).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(loadEditSourceImage(storage(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" })), campaignId, path("a.png"))).rejects.toThrow(/5 MB/);
    await expect(loadEditSourceImage(storage(null, { message: "missing" }), campaignId, path("a.png"))).rejects.toMatchObject({ status: 503 });
  });
});
