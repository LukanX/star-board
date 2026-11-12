import type { SupabaseClient } from "@supabase/supabase-js";
import { ART_SAFETY_INSTRUCTION } from "@/lib/ai/prompts";
import { StudioError, studioManifestHash } from "@/lib/ai/studio-context";
import { hasImageSignature } from "@/lib/ai/visual-style-references";
import { validateCampaignArtPath } from "@/lib/storage/campaign-art";
import { campaignArtMaxBytes } from "@/lib/validation/art";
import { imagePromptMaxLength, type ImageEdit, type ImageGenerationInput } from "@/lib/validation/image";
import { studioManifestSchema, type StudioManifest } from "@/lib/validation/studio";

const entityTables = {
  character: "characters",
  npc: "npcs",
  faction: "factions",
  job: "jobs",
  place: "places",
  enemy: "enemies",
} as const;

export type ResolvedEditSource = {
  path: string;
  kind: "draft" | "saved-art" | "studio-asset";
  parentRunId?: string;
  manifest?: StudioManifest;
};

export function buildImageEditPrompt(instruction: string) {
  return [
    ART_SAFETY_INSTRUCTION,
    "Edit the attached image. Apply only this requested change:",
    instruction.trim(),
    "Keep everything else the same: composition, subjects and their identities, palette, lighting and rendering style.",
  ].join("\n").slice(0, imagePromptMaxLength);
}

type ResolveEditSourceInput = {
  supabase: SupabaseClient;
  campaignId: string;
  userId: string;
  role: "gm" | "player";
  input: Pick<ImageGenerationInput, "targetKind" | "purpose" | "characterId">;
  edit: ImageEdit;
};

function requireUploadedPath(campaignId: string, path: string | null | undefined) {
  if (!path || !validateCampaignArtPath(campaignId, path)) {
    throw new StudioError("Only artwork stored in this campaign can be edited.");
  }
  return path;
}

// Source paths are always read from the database so a client can never name an arbitrary storage object.
export async function resolveEditSource({ supabase, campaignId, userId, role, input, edit }: ResolveEditSourceInput): Promise<ResolvedEditSource> {
  const { source } = edit;

  if (source.type === "draft") {
    const { data: run, error } = await supabase.from("ai_generation_runs")
      .select("id, status, image_path, purpose, target_kind, target_character_id, studio_manifest_hash")
      .eq("campaign_id", campaignId).eq("id", source.generationRunId).eq("requested_by", userId).eq("kind", "image")
      .maybeSingle();
    if (error) throw new StudioError("The draft to edit could not be read.", 503);
    if (!run || run.status !== "complete" || !run.image_path
      || run.purpose !== input.purpose || run.target_kind !== input.targetKind
      || (input.targetKind === "character" && run.target_character_id !== input.characterId)) {
      throw new StudioError("The draft to edit is no longer available. Generate a new draft instead.", 404);
    }

    let manifest: StudioManifest | undefined;
    if (input.purpose === "studio-art") {
      const parsed = studioManifestSchema.safeParse(source.manifest);
      if (!parsed.success || studioManifestHash(parsed.data) !== run.studio_manifest_hash) {
        throw new StudioError("The Studio draft changed. Review it again before editing.", 409);
      }
      manifest = parsed.data;
    }

    return { path: requireUploadedPath(campaignId, run.image_path), kind: "draft", parentRunId: run.id, manifest };
  }

  if (role !== "gm" && !(input.targetKind === "character" && source.type === "saved-art")) {
    throw new StudioError("GM access is required to edit this artwork.", 403);
  }

  if (source.type === "saved-art") {
    if (input.targetKind === "scene" || input.targetKind === "battlemap" || input.targetKind === "visual-style") {
      throw new StudioError("This artwork cannot be edited from here.");
    }
    const { data: record, error } = await supabase.from(entityTables[input.targetKind]).select("art_path")
      .eq("campaign_id", campaignId).eq("id", source.entityId).maybeSingle();
    if (error) throw new StudioError("The saved artwork could not be read.", 503);
    if (!record) throw new StudioError("The saved record was not found in this campaign.", 404);
    return { path: requireUploadedPath(campaignId, record.art_path), kind: "saved-art" };
  }

  const { data: asset, error } = await supabase.from("campaign_art_assets").select("path, kind, manifest")
    .eq("campaign_id", campaignId).eq("id", source.assetId).maybeSingle();
  if (error) throw new StudioError("The library artwork could not be read.", 503);
  if (!asset || asset.kind !== input.targetKind) throw new StudioError("The library artwork was not found.", 404);
  const manifest = studioManifestSchema.safeParse(asset.manifest);
  if (!manifest.success) throw new StudioError("The library artwork has invalid composition data.", 409);
  return { path: requireUploadedPath(campaignId, asset.path), kind: "studio-asset", manifest: manifest.data };
}

export async function loadEditSourceImage(supabase: SupabaseClient, campaignId: string, path: string) {
  requireUploadedPath(campaignId, path);
  const { data, error } = await supabase.storage.from("campaign-art").download(path);
  if (error || !data) throw new StudioError("The image to edit could not be read.", 503);
  if (!["image/png", "image/jpeg", "image/webp"].includes(data.type) || data.size <= 0 || data.size > campaignArtMaxBytes) {
    throw new StudioError("The image to edit must be PNG, JPEG or WebP and at most 5 MB.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!hasImageSignature(bytes, data.type)) throw new StudioError("The image to edit has invalid image data.");
  return [{ dataUrl: `data:${data.type};base64,${Buffer.from(bytes).toString("base64")}` }];
}
