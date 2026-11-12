import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { studioCompositionSchema, studioManifestSchema } from "@/lib/validation/studio";
import { studioManifestHash } from "@/lib/ai/studio-context";
import { approveStudioArt, manageStudioArt, listPublishedArt, listStudioAssets } from "@/lib/campaign/studio-server";
import { removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";

const env = loadEnv("test", process.cwd(), "");
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const enabled = process.env.RUN_LOCAL_SUPABASE_TESTS === "1" && url.length > 0 && new URL(url).hostname === "127.0.0.1" && key.length > 0;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eX8AAAAASUVORK5CYII=", "base64");
const password = "local-studio-test-password-2026";
let gm: SupabaseClient;
let player: SupabaseClient;
let campaignId: string;
let gmId: string;
let playerId: string;
let originalPath: string;
let assignedPath: string;
let foreignCampaignId: string | null = null;
const cleanupPaths: string[] = [];

async function authenticate(email: string) {
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  const result = signedIn.error ? await client.auth.signUp({ email, password }) : signedIn;
  if (result.error || !result.data.user || !result.data.session) throw new Error("Local Studio test authentication failed.");
  return { client, id: result.data.user.id };
}

describe.skipIf(!enabled)("local Studio persistence and RLS", () => {
  beforeAll(async () => {
    const owner = await authenticate("star-board-studio-gm@local.test");
    const member = await authenticate("star-board-studio-player@local.test");
    gm = owner.client; gmId = owner.id; player = member.client; playerId = member.id;
    const created = await gm.rpc("create_campaign", { campaign_name: `Studio verification ${randomUUID()}`, campaign_description: "Local-only Studio integration tests." });
    expect(created.error).toBeNull(); campaignId = created.data;
    const token = `studio-test-${randomUUID()}`;
    expect((await gm.from("campaign_join_links").insert({ campaign_id: campaignId, created_by: gmId, token_hash: createHash("sha256").update(token).digest("hex") })).error).toBeNull();
    expect((await player.rpc("redeem_campaign_join_link", { join_token_hash: createHash("sha256").update(token).digest("hex") })).error).toBeNull();
  });
  afterAll(async () => {
    if (foreignCampaignId) await gm.from("campaigns").delete().eq("id", foreignCampaignId);
    if (campaignId) {
      const assets = await gm.from("campaign_art_assets").select("id,path").eq("campaign_id", campaignId);
      for (const asset of assets.data ?? []) {
        cleanupPaths.push(asset.path);
        await gm.rpc("manage_studio_art", { p_campaign_id: campaignId, p_asset_id: asset.id, p_action: "delete" });
      }
      await gm.from("characters").delete().eq("campaign_id", campaignId);
      await gm.from("enemies").delete().eq("campaign_id", campaignId);
      if (cleanupPaths.length) await gm.storage.from("campaign-art").remove(cleanupPaths);
      await gm.from("campaigns").delete().eq("id", campaignId);
    }
    await gm?.auth.signOut(); await player?.auth.signOut();
  });

  it("keeps approved provenance private through sharing, assignment, audit expiry and library deletion", async () => {
    const prompt = "Private scene: a hidden monster fights the crew in the reactor.";
    const manifest = studioManifestSchema.parse({
      composition: studioCompositionSchema.parse({}), direction: "Crew fighting a hidden monster",
      sources: [], style: "", references: [],
    });
    const run = await gm.from("ai_generation_runs").insert({
      campaign_id: campaignId, requested_by: gmId, kind: "image", mode: "create", model: "test/image",
      prompt_hash: createHash("sha256").update(prompt).digest("hex"), purpose: "studio-art", target_kind: "scene", provider: "openrouter",
      studio_manifest_hash: studioManifestHash(manifest), status: "complete", aspect_ratio: "1:1",
    }).select("id").single();
    expect(run.error).toBeNull();
    originalPath = `${campaignId}/${gmId}/studio-draft-${run.data!.id}.png`;
    cleanupPaths.push(originalPath);
    expect((await gm.storage.from("campaign-art").upload(originalPath, pixel, { contentType: "image/png" })).error).toBeNull();
    expect((await gm.rpc("attach_ai_generation_image", { p_generation_run_id: run.data!.id, p_image_path: originalPath, p_image_media_type: "image/png" })).data).toBe(true);
    expect((await player.storage.from("campaign-art").createSignedUrl(originalPath, 60)).error).not.toBeNull();
    expect((await player.from("ai_generation_runs").select("id").eq("id", run.data!.id)).data).toEqual([]);
    await expect(approveStudioArt(gm, campaignId, gmId, { generationRunId: run.data!.id, title: "Scene", caption: "", prompt, manifest: { ...manifest, direction: "Forged provenance" } })).rejects.toThrow("could not be verified");
    const input = { generationRunId: run.data!.id, title: "Reactor clash", caption: "Shared display only", prompt, manifest };
    const assetId = await approveStudioArt(gm, campaignId, gmId, input);
    expect(await approveStudioArt(gm, campaignId, gmId, input)).toBe(assetId);
    const assets = await listStudioAssets(gm, campaignId);
    expect(assets).toHaveLength(1);
    const asset = assets[0];
    cleanupPaths.push(asset.path);
    expect(asset.prompt).toBe(prompt);
    expect((await player.from("campaign_art_assets").select("*").eq("campaign_id", campaignId)).data).toEqual([]);
    expect((await player.from("campaign_art_assignments").select("*").eq("campaign_id", campaignId)).data).toEqual([]);
    expect((await player.storage.from("campaign-art").createSignedUrl(asset.path, 60)).error).not.toBeNull();
    expect((await player.rpc("manage_studio_art", { p_campaign_id: campaignId, p_asset_id: assetId, p_action: "share", p_title: "Unauthorized", p_caption: "" })).error).not.toBeNull();
    await manageStudioArt(gm, campaignId, gmId, assetId, { action: "share", title: "Safe title", caption: "Safe caption" });
    const published = await listPublishedArt(player, campaignId);
    expect(published).toHaveLength(1);
    expect(Object.keys(published[0]).sort()).toEqual(["caption","id","path","signedUrl","title"]);
    expect(JSON.stringify(published)).not.toContain("hidden monster");
    expect((await player.storage.from("campaign-art").createSignedUrl(asset.path, 60)).error).toBeNull();
    expect((await player.from("campaign_art_publications").update({ title: "Changed" }).eq("asset_id", assetId)).error).not.toBeNull();
    await manageStudioArt(gm, campaignId, gmId, assetId, { action: "unshare" });
    expect(await listPublishedArt(player, campaignId)).toEqual([]);
    expect((await player.storage.from("campaign-art").createSignedUrl(asset.path, 60)).error).not.toBeNull();
    expect((await gm.storage.from("campaign-art").update(asset.path, pixel, { contentType: "image/png" })).error).not.toBeNull();

    const character = await gm.from("characters").insert({ campaign_id: campaignId, owner_id: playerId, name: "Studio Crew", species: "Human", physical_description: "Red jacket" }).select("id,updated_at").single();
    expect(character.error).toBeNull();
    await expect(manageStudioArt(gm, campaignId, gmId, assetId, { action: "assign", kind: "character", id: character.data!.id, expectedUpdatedAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("Subject changed");
    await manageStudioArt(gm, campaignId, gmId, assetId, { action: "assign", kind: "character", id: character.data!.id, expectedUpdatedAt: character.data!.updated_at });
    const assigned = await player.from("characters").select("art_path,art_prompt,art_subject,art_provider,physical_description").eq("id", character.data!.id).single();
    expect(assigned.error).toBeNull(); assignedPath = assigned.data!.art_path;
    cleanupPaths.push(assignedPath);
    expect(assigned.data).toMatchObject({ art_prompt: null, art_subject: null, art_provider: null, physical_description: "Red jacket" });
    expect(assignedPath).not.toBe(asset.path);
    expect((await player.storage.from("campaign-art").createSignedUrl(assignedPath, 60)).error).toBeNull();
    expect((await player.storage.from("campaign-art").createSignedUrl(asset.path, 60)).error).not.toBeNull();
    const enemy = await gm.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "Hidden Studio monster", playerDescription: "A crystal beast", isRevealed: false, artPath: null },
      p_details: { level: 2, size: "medium", rarity: "common", traits: [], family: null, statBlock: { schemaVersion: 1 }, gmNotesMarkdown: "", origin: "manual" },
    });
    expect(enemy.error).toBeNull();
    const enemyBefore = await gm.from("enemies").select("updated_at").eq("id", enemy.data).single();
    expect(enemyBefore.error).toBeNull();
    await manageStudioArt(gm, campaignId, gmId, assetId, { action: "assign", kind: "enemy", id: enemy.data, expectedUpdatedAt: enemyBefore.data!.updated_at });
    const enemyAfter = await gm.from("enemies").select("art_path,is_revealed").eq("id", enemy.data).single();
    expect(enemyAfter.error).toBeNull();
    const enemyPath = enemyAfter.data!.art_path;
    cleanupPaths.push(enemyPath);
    expect(enemyAfter.data!.is_revealed).toBe(false);
    expect((await player.from("enemies").select("id").eq("id", enemy.data)).data).toEqual([]);
    expect((await player.storage.from("campaign-art").createSignedUrl(enemyPath, 60)).error).not.toBeNull();
    expect((await gm.from("enemies").update({ is_revealed: true }).eq("id", enemy.data)).error).toBeNull();
    expect((await player.storage.from("campaign-art").createSignedUrl(enemyPath, 60)).error).toBeNull();
    expect((await gm.from("enemies").update({ is_revealed: false }).eq("id", enemy.data)).error).toBeNull();
    expect(await removeCampaignArtIfUnreferenced(gm, campaignId, asset.path)).toBe(false);
    expect((await gm.from("ai_generation_runs").delete().eq("id", run.data!.id)).error).toBeNull();
    expect((await gm.from("campaign_art_assets").select("prompt").eq("id", assetId).single()).data?.prompt).toBe(prompt);
    expect((await player.storage.from("campaign-art").createSignedUrl(originalPath, 60)).error).not.toBeNull();
    expect((await player.storage.from("campaign-art").createSignedUrl(asset.path, 60)).error).not.toBeNull();
    await manageStudioArt(gm, campaignId, gmId, assetId, { action: "delete" });
    expect((await player.storage.from("campaign-art").createSignedUrl(assignedPath, 60)).error).toBeNull();
    expect((await player.storage.from("campaign-art").createSignedUrl(enemyPath, 60)).error).not.toBeNull();
    const binding = await gm.from("campaign_art_assignments").select("provenance,asset_id").eq("path", assignedPath).single();
    expect(binding.error).toBeNull();
    expect(binding.data?.asset_id).toBeNull();
    expect(binding.data?.provenance.prompt).toBe(prompt);
    expect((await gm.from("characters").delete().eq("id", character.data!.id)).error).toBeNull();
    expect((await gm.from("campaign_art_cleanup").select("path").eq("path", assignedPath)).data).toHaveLength(1);
  }, 30_000);

  it("records redo and edit lineage and enforces the edit source constraint", async () => {
    const run = (extra: Record<string, unknown>) => gm.from("ai_generation_runs").insert({
      campaign_id: campaignId, requested_by: gmId, kind: "image", mode: "refine", model: "test/image",
      prompt_hash: createHash("sha256").update(randomUUID()).digest("hex"), purpose: "entity-art", target_kind: "npc",
      provider: "openrouter", status: "complete", aspect_ratio: "1:1", ...extra,
    }).select("id, operation, parent_run_id, edit_source_kind").single();
    const parent = await run({});
    expect(parent.error).toBeNull();
    expect(parent.data?.operation).toBe("generate");
    const redo = await run({ operation: "redo", parent_run_id: parent.data!.id });
    expect(redo.data).toMatchObject({ operation: "redo", parent_run_id: parent.data!.id, edit_source_kind: null });
    const edit = await run({ operation: "edit", parent_run_id: parent.data!.id, edit_source_kind: "draft" });
    expect(edit.data).toMatchObject({ operation: "edit", edit_source_kind: "draft" });
    expect((await run({ operation: "edit" })).error).not.toBeNull();
    expect((await run({ operation: "redo", edit_source_kind: "draft" })).error).not.toBeNull();
    expect((await run({ operation: "clone" })).error).not.toBeNull();
    expect((await player.from("ai_generation_runs").select("id").eq("id", edit.data!.id)).data).toEqual([]);
  }, 30_000);

  it("keeps approved upscale provenance after its source entry is deleted", async () => {
    const manifest = studioManifestSchema.parse({
      composition: studioCompositionSchema.parse({}), direction: "Crew at the reactor",
      sources: [], style: "", references: [],
    });
    const prompt = "Preserve the reactor image while increasing its resolution.";
    const createRun = async (input: Record<string, unknown> = {}) => {
      const result = await gm.from("ai_generation_runs").insert({
        campaign_id: campaignId, requested_by: gmId, kind: "image", mode: "refine", model: "test/image",
        prompt_hash: createHash("sha256").update(prompt).digest("hex"), purpose: "studio-art", target_kind: "scene",
        provider: "openrouter", studio_manifest_hash: studioManifestHash(manifest), status: "complete", aspect_ratio: "16:9",
        ...input,
      }).select("id").single();
      expect(result.error).toBeNull();
      const path = `${campaignId}/${gmId}/studio-draft-${result.data!.id}.png`;
      cleanupPaths.push(path);
      expect((await gm.storage.from("campaign-art").upload(path, pixel, { contentType: "image/png" })).error).toBeNull();
      expect((await gm.rpc("attach_ai_generation_image", { p_generation_run_id: result.data!.id, p_image_path: path, p_image_media_type: "image/png" })).data).toBe(true);
      return result.data!.id as string;
    };

    const sourceRunId = await createRun({ mode: "create", aspect_ratio: "1:1" });
    const sourceAssetId = await approveStudioArt(gm, campaignId, gmId, {
      generationRunId: sourceRunId, title: "Reactor", caption: "Original caption", prompt, manifest,
    });
    const source = await gm.from("campaign_art_assets").select("path").eq("id", sourceAssetId).single();
    expect(source.error).toBeNull();
    cleanupPaths.push(source.data!.path);
    await manageStudioArt(gm, campaignId, gmId, sourceAssetId, { action: "share", title: "Shared source", caption: "Original caption" });
    const character = await gm.from("characters").insert({
      campaign_id: campaignId, owner_id: playerId, name: `Upscale subject ${randomUUID()}`, species: "Human",
      physical_description: "Red jacket",
    }).select("id,updated_at").single();
    expect(character.error).toBeNull();
    await manageStudioArt(gm, campaignId, gmId, sourceAssetId, {
      action: "assign", kind: "character", id: character.data!.id, expectedUpdatedAt: character.data!.updated_at,
    });
    const assignmentBefore = await gm.from("campaign_art_assignments").select("asset_id,path")
      .eq("campaign_id", campaignId).eq("target_id", character.data!.id).maybeSingle();
    expect(assignmentBefore.data?.asset_id).toBe(sourceAssetId);
    cleanupPaths.push(assignmentBefore.data!.path);
    const assignedCharacter = await gm.from("characters").select("art_path").eq("id", character.data!.id).single();
    expect(assignedCharacter.data?.art_path).toBe(assignmentBefore.data!.path);

    const malformed = await gm.from("ai_generation_runs").insert({
      campaign_id: campaignId, requested_by: gmId, kind: "image", mode: "refine", model: "test/image",
      prompt_hash: createHash("sha256").update(prompt).digest("hex"), purpose: "studio-art", target_kind: "scene",
      provider: "openrouter", studio_manifest_hash: studioManifestHash(manifest), status: "complete", aspect_ratio: "16:9",
      operation: "upscale", requested_resolution: "4K", source_asset_id: sourceAssetId, image_width: 3840, image_height: null,
    });
    expect(malformed.error).not.toBeNull();

    const activeRun = await gm.from("ai_generation_runs").insert({
      campaign_id: campaignId, requested_by: gmId, kind: "image", mode: "refine", model: "test/image",
      prompt_hash: createHash("sha256").update(prompt).digest("hex"), purpose: "studio-art", target_kind: "scene",
      provider: "openrouter", studio_manifest_hash: studioManifestHash(manifest), status: "running", aspect_ratio: "16:9",
      operation: "upscale", requested_resolution: "4K", source_asset_id: sourceAssetId,
    }).select("id").single();
    expect(activeRun.error).toBeNull();
    const blockedDeletion = await gm.rpc("manage_studio_art", {
      p_campaign_id: campaignId, p_asset_id: sourceAssetId, p_action: "delete",
    });
    expect(blockedDeletion.error).not.toBeNull();
    expect((await gm.from("campaign_art_assets").select("path").eq("id", sourceAssetId).single()).data?.path).toBe(source.data!.path);
    expect((await gm.from("ai_generation_runs").update({ status: "failed" }).eq("id", activeRun.data!.id)).error).toBeNull();

    const upscaleRunId = await createRun({
      operation: "upscale", requested_resolution: "4K", source_asset_id: sourceAssetId, image_width: 3840, image_height: 2160,
    });
    const approval = { generationRunId: upscaleRunId, title: "Reactor (4K)", caption: "Original caption", prompt, manifest };
    const upscaleAssetId = await approveStudioArt(gm, campaignId, gmId, approval);
    expect(await approveStudioArt(gm, campaignId, gmId, approval)).toBe(upscaleAssetId);
    expect((await player.from("campaign_art_assets").select("id").eq("id", upscaleAssetId)).data).toEqual([]);
    const saved = await gm.from("campaign_art_assets").select("id,operation,requested_resolution,image_width,image_height,source_asset_id")
      .eq("id", upscaleAssetId).single();
    expect(saved.data).toMatchObject({
      operation: "upscale", requested_resolution: "4K", image_width: 3840, image_height: 2160, source_asset_id: sourceAssetId,
    });
    cleanupPaths.push((await gm.from("campaign_art_assets").select("path").eq("id", upscaleAssetId).single()).data!.path);
    expect((await listPublishedArt(gm, campaignId)).map((art) => art.id)).toEqual([sourceAssetId]);
    const assignmentAfter = await gm.from("campaign_art_assignments").select("asset_id,path")
      .eq("campaign_id", campaignId).eq("target_id", character.data!.id).maybeSingle();
    expect(assignmentAfter.data).toEqual(assignmentBefore.data);
    expect((await gm.from("characters").select("art_path").eq("id", character.data!.id).single()).data?.art_path).toBe(assignmentBefore.data!.path);
    expect((await gm.from("campaign_art_assets").select("path").eq("id", sourceAssetId).single()).data?.path).toBe(source.data!.path);

    const foreign = await gm.rpc("create_campaign", { campaign_name: `Upscale FK ${randomUUID()}`, campaign_description: "Local-only cross-campaign source constraint test." });
    expect(foreign.error).toBeNull();
    foreignCampaignId = foreign.data as string;
    const crossCampaignRun = await gm.from("ai_generation_runs").insert({
      campaign_id: foreignCampaignId, requested_by: gmId, kind: "image", mode: "refine", model: "test/image",
      prompt_hash: createHash("sha256").update(prompt).digest("hex"), purpose: "studio-art", target_kind: "scene",
      provider: "openrouter", studio_manifest_hash: studioManifestHash(manifest), status: "complete", aspect_ratio: "16:9",
      operation: "upscale", requested_resolution: "4K", source_asset_id: sourceAssetId,
    });
    expect(crossCampaignRun.error).not.toBeNull();
    await gm.from("campaigns").delete().eq("id", foreignCampaignId);
    foreignCampaignId = null;

    await manageStudioArt(gm, campaignId, gmId, sourceAssetId, { action: "delete" });
    const retained = await gm.from("campaign_art_assets").select("operation,requested_resolution,image_width,image_height,source_asset_id")
      .eq("id", upscaleAssetId).single();
    expect(retained.data).toEqual({
      operation: "upscale", requested_resolution: "4K", image_width: 3840, image_height: 2160, source_asset_id: null,
    });
  }, 30_000);
});
