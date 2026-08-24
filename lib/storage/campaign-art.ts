import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignArtPathSchema } from "@/lib/validation/art";

export const campaignArtBucket = "campaign-art";
export const enemyArtSignedUrlLifetime = 600;

const artReferenceTables = ["characters", "npcs", "factions", "jobs", "places", "enemies"] as const;

export function isExternalArtPath(path: string | null | undefined) {
  return Boolean(path?.startsWith("http://") || path?.startsWith("https://"));
}

export function campaignArtSignedUrlLifetime(path: string, expiresIn = 3600, isEnemyArt = false) {
  const fileName = path.split("/").at(-1) ?? "";
  return isEnemyArt || fileName.startsWith("enemy-") ? Math.min(expiresIn, enemyArtSignedUrlLifetime) : expiresIn;
}

export function validateCampaignArtPath(campaignId: string, path: string) {
  const parsed = campaignArtPathSchema.safeParse(path);

  if (!parsed.success) return false;

  const [pathCampaignId, ownerId, fileName] = parsed.data.split("/");
  return pathCampaignId === campaignId && /^[0-9a-f-]{36}$/i.test(ownerId) && Boolean(fileName);
}

export async function createCampaignArtSignedUrl(supabase: SupabaseClient, path: string, expiresIn = 3600, isEnemyArt = false) {
  if (isExternalArtPath(path)) return path;

  const signedUrlLifetime = campaignArtSignedUrlLifetime(path, expiresIn, isEnemyArt);
  const { data, error } = await supabase.storage.from(campaignArtBucket).createSignedUrl(path, signedUrlLifetime);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to sign campaign art.");
  }

  return data.signedUrl;
}

export async function createCampaignArtSignedUrlForCampaign(supabase: SupabaseClient, campaignId: string, path: string, expiresIn = 3600) {
  const { data, error } = await supabase
    .from("enemies")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("art_path", path)
    .limit(1);

  if (error) throw new Error(error.message);

  const isEnemyArt = (data ?? []).length > 0;
  return {
    signedUrl: await createCampaignArtSignedUrl(supabase, path, expiresIn, isEnemyArt),
    expiresIn: campaignArtSignedUrlLifetime(path, expiresIn, isEnemyArt),
  };
}

export async function addCampaignArtUrls<T extends { art_path: string | null }>(supabase: SupabaseClient, records: T[], isEnemyArt = false) {
  return Promise.all(records.map(async (record) => {
    if (!record.art_path) return { ...record, art_url: null };

    try {
      return { ...record, art_url: await createCampaignArtSignedUrl(supabase, record.art_path, 3600, isEnemyArt) };
    } catch {
      return { ...record, art_url: null };
    }
  }));
}

export async function removeCampaignArtIfUnreferenced(supabase: SupabaseClient, campaignId: string, path: string | null | undefined) {
  if (!path || isExternalArtPath(path) || !validateCampaignArtPath(campaignId, path)) return false;

  try {
    const references = await Promise.all(artReferenceTables.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select("art_path")
        .eq("campaign_id", campaignId)
        .eq("art_path", path)
        .limit(1);

      if (error) return true;
      return (data ?? []).length > 0;
    }));

    if (references.some(Boolean)) return false;

    const { error } = await supabase.storage.from(campaignArtBucket).remove([path]);
    return !error;
  } catch {
    return false;
  }
}
