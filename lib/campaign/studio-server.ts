import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { campaignArtBucket, createCampaignArtSignedUrl, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { StudioError, studioManifestHash } from "@/lib/ai/studio-context";
import { studioManifestSchema, type StudioManifest, studioApprovalSchema, studioAssetActionSchema, type StudioLibraryFilter } from "@/lib/validation/studio";

const assetSchema = z.object({
  id: z.string().uuid(), campaign_id: z.string().uuid(), title: z.string(), caption: z.string(),
  kind: z.enum(["scene", "battlemap"]), path: z.string(), media_type: z.string(),
  prompt: z.string(), manifest: studioManifestSchema, model: z.string(), provider: z.string(),
  aspect_ratio: z.string(), created_at: z.string(), updated_at: z.string(),
  operation: z.enum(["generate", "redo", "edit", "upscale"]),
  requested_resolution: z.enum(["1K", "2K", "4K"]).nullable(),
  image_width: z.number().int().positive().nullable(), image_height: z.number().int().positive().nullable(),
  source_asset_id: z.string().uuid().nullable(),
}).superRefine((asset, context) => {
  if ((asset.image_width === null) !== (asset.image_height === null)) {
    context.addIssue({ code: "custom", path: ["image_height"], message: "Image dimensions must be recorded together." });
  }
  if (asset.image_width !== null && asset.image_height !== null && asset.image_width * asset.image_height > 64_000_000) {
    context.addIssue({ code: "custom", path: ["image_width"], message: "Image dimensions exceed the pixel limit." });
  }
  if (asset.operation === "upscale" && asset.requested_resolution !== "4K") {
    context.addIssue({ code: "custom", path: ["requested_resolution"], message: "Upscaled assets must record a 4K request." });
  }
  if (asset.operation !== "upscale" && asset.source_asset_id !== null) {
    context.addIssue({ code: "custom", path: ["source_asset_id"], message: "Only upscaled assets can reference a source asset." });
  }
  if (asset.source_asset_id === asset.id) {
    context.addIssue({ code: "custom", path: ["source_asset_id"], message: "An asset cannot reference itself as its source." });
  }
});
export type StudioAsset = z.infer<typeof assetSchema> & { signedUrl: string; shared: boolean };
export type PublishedArt = { id: string; title: string; caption: string; path: string; signedUrl: string };
export type StudioApproval = z.infer<typeof studioApprovalSchema>;
export type StudioAssetAction = z.infer<typeof studioAssetActionSchema>;

export function studioRpcError(error: { code?: string; message?: string }) {
  const statuses: Record<string, number> = { "42501": 403, "P0002": 404, "PT409": 409, "22023": 400, "23514": 400 };
  console.error("studio_rpc_failure", { code: error.code ?? "unknown" });
  throw new StudioError(statuses[error.code ?? ""] ? error.message ?? "Artwork action failed." : "Artwork could not be saved.", statuses[error.code ?? ""] ?? 503);
}

export async function listStudioAssets(supabase: SupabaseClient, campaignId: string, offset = 0, filter: StudioLibraryFilter = "all") {
  const { data: publications, error: publicationError } = await supabase.from("campaign_art_publications").select("asset_id").eq("campaign_id", campaignId);
  if (publicationError) throw new StudioError("Art sharing status could not be loaded.", 503);
  const shared = new Set((publications ?? []).map((publication) => publication.asset_id as string));
  if (filter === "shared" && !shared.size) return [];
  let query = supabase.from("campaign_art_assets").select("*").eq("campaign_id", campaignId);
  if (filter === "scene" || filter === "battlemap") query = query.eq("kind", filter);
  if (filter === "shared") query = query.in("id", [...shared]);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 23);
  if (error) throw new StudioError("The art library could not be loaded.", 503);
  return Promise.all(z.array(assetSchema).parse(data ?? []).map(async (asset): Promise<StudioAsset> => ({
    ...asset, signedUrl: await createCampaignArtSignedUrl(supabase, asset.path, 600), shared: shared.has(asset.id),
  })));
}

export async function listPublishedArt(supabase: SupabaseClient, campaignId: string, offset = 0, assetId?: string): Promise<PublishedArt[]> {
  let query = supabase.from("campaign_art_publications").select("asset_id,title,caption,path")
    .eq("campaign_id", campaignId).order("created_at", { ascending: false }).order("asset_id");
  if (assetId) query = query.eq("asset_id", assetId);
  const { data, error } = await query.range(offset, offset + 23);
  if (error) throw new StudioError("Shared artwork could not be loaded.", 503);
  return Promise.all((data ?? []).map(async (row) => ({
    id: String(row.asset_id), title: String(row.title), caption: String(row.caption), path: String(row.path),
    signedUrl: await createCampaignArtSignedUrl(supabase, row.path, 600),
  })));
}

async function removeObject(supabase: SupabaseClient, path: string) {
  const { error } = await supabase.storage.from(campaignArtBucket).remove([path]);
  if (error) throw new StudioError("Artwork storage cleanup failed. The saved artwork has not been overwritten.", 503);
}

export async function approveStudioArt(supabase: SupabaseClient, campaignId: string, userId: string, input: StudioApproval) {
  const { data: run, error } = await supabase.from("ai_generation_runs")
    .select("id,requested_by,status,purpose,image_path,image_media_type,prompt_hash,studio_manifest_hash")
    .eq("campaign_id", campaignId).eq("id", input.generationRunId).maybeSingle();
  if (error) throw new StudioError("The draft could not be verified.", 503);
  if (!run || run.requested_by !== userId || run.status !== "complete" || run.purpose !== "studio-art" || !run.image_path
    || run.prompt_hash !== createHash("sha256").update(input.prompt).digest("hex")
    || run.studio_manifest_hash !== studioManifestHash(input.manifest))
    throw new StudioError("The completed Studio draft or its provenance could not be verified.");
  const { data: existing, error: existingError } = await supabase.from("campaign_art_assets").select("id").eq("campaign_id", campaignId).eq("generation_run_id", run.id).maybeSingle();
  if (existingError) throw new StudioError("Existing approval could not be checked.", 503);
  if (existing) return existing.id as string;
  const id = randomUUID();
  const extension = extensionFor(run.image_media_type);
  const path = `${campaignId}/${userId}/studio-${id}.${extension}`;
  const { error: copyError } = await supabase.storage.from(campaignArtBucket).copy(run.image_path, path);
  if (copyError) throw new StudioError("The approved image could not be copied to the library.", 503);
  const { data: savedId, error: saveError } = await supabase.rpc("approve_studio_art", {
    p_campaign_id: campaignId, p_asset_id: id, p_run_id: run.id, p_title: input.title, p_caption: input.caption,
    p_prompt: input.prompt, p_manifest_text: JSON.stringify(input.manifest), p_path: path,
  });
  if (saveError || !savedId) {
    await removeObject(supabase, path);
    studioRpcError(saveError ?? {});
  }
  if (savedId !== id) await removeObject(supabase, path);
  await removeObject(supabase, run.image_path);
  return String(savedId);
}

function extensionFor(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  throw new StudioError("The generated image media type is unsupported.");
}

export async function manageStudioArt(supabase: SupabaseClient, campaignId: string, userId: string, assetId: string, input: StudioAssetAction) {
  if (input.action === "assign") {
    const { data: asset, error } = await supabase.from("campaign_art_assets").select("path,media_type").eq("campaign_id", campaignId).eq("id", assetId).maybeSingle();
    if (error) throw new StudioError("Artwork could not be loaded.", 503);
    if (!asset) throw new StudioError("Artwork not found.", 404);
    const path = `${campaignId}/${userId}/${input.kind}-${randomUUID()}.${extensionFor(asset.media_type)}`;
    const { error: copyError } = await supabase.storage.from(campaignArtBucket).copy(asset.path, path);
    if (copyError) throw new StudioError("The entity artwork copy could not be created.", 503);
    const { data: previousPath, error: assignError } = await supabase.rpc("assign_studio_art", {
      p_campaign_id: campaignId, p_asset_id: assetId, p_kind: input.kind, p_target_id: input.id,
      p_expected_updated_at: input.expectedUpdatedAt, p_path: path,
    });
    if (assignError) { await removeObject(supabase, path); studioRpcError(assignError); }
    if (typeof previousPath === "string") await removeCampaignArtIfUnreferenced(supabase, campaignId, previousPath);
    return;
  }
  const { data: path, error } = await supabase.rpc("manage_studio_art", {
    p_campaign_id: campaignId, p_asset_id: assetId, p_action: input.action,
    ...("title" in input ? { p_title: input.title, p_caption: input.caption } : {}),
  });
  if (error) studioRpcError(error);
  if (input.action === "delete" && typeof path === "string") {
    await removeObject(supabase, path);
    const { error: cleanupError } = await supabase.from("campaign_art_cleanup").delete().eq("campaign_id", campaignId).eq("path", path);
    if (cleanupError) throw new StudioError("The artwork was deleted, but its cleanup receipt could not be cleared. Scheduled cleanup will retry.", 503);
  }
}

export type { StudioManifest };
