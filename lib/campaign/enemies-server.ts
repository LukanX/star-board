import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { ApiEnemy, EnemyFilters } from "@/lib/campaign/types";
import { enemyStatBlockSchema, type EnemyStatBlockV1 } from "@/lib/validation/enemy";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignEnemiesResult = {
  role: "gm" | "player";
  displayName: string;
  enemies: ApiEnemy[];
};

export type CampaignEnemyResult = {
  role: "gm" | "player";
  displayName: string;
  enemy: ApiEnemy;
};

export const enemyPublicColumns = "id, campaign_id, author_id, name, player_description, is_revealed, art_path, created_at, updated_at";
export const enemyDetailSummaryColumns = "enemy_id, campaign_id, level, size, rarity, traits, family, origin";
export const enemyDetailColumns = "enemy_id, campaign_id, level, size, rarity, traits, family, stat_block, gm_notes_markdown, origin, art_subject, art_prompt, art_provider, source_provider, source_external_id, source_content_hash, source_snapshot, created_at, updated_at";

type EnemyPublicRow = {
  id: string;
  campaign_id: string;
  author_id: string;
  name: string;
  player_description: string;
  is_revealed: boolean;
  art_path: string | null;
  created_at: string;
  updated_at: string;
};

type EnemyDetailRow = {
  enemy_id: string;
  campaign_id: string;
  level: number;
  size: ApiEnemy["size"];
  rarity: ApiEnemy["rarity"];
  traits: string[];
  family: string | null;
  stat_block?: unknown;
  gm_notes_markdown?: string;
  origin: ApiEnemy["origin"];
  art_subject?: string | null;
  art_prompt?: string | null;
  art_provider?: string | null;
  source_provider?: "aon" | null;
  source_external_id?: number | null;
  source_content_hash?: string | null;
  source_snapshot?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

function isDetailRow(value: unknown): value is EnemyDetailRow {
  return Boolean(value && typeof value === "object" && "enemy_id" in value && "level" in value && "origin" in value);
}

function parseStatBlock(value: unknown): EnemyStatBlockV1 | null {
  const result = enemyStatBlockSchema.safeParse(value);
  return result.success ? result.data : null;
}

function sourceUpdatedAt(detail: EnemyDetailRow): string | null {
  const retrievedAt = detail.source_snapshot?.retrievedAt;
  return typeof retrievedAt === "string" ? retrievedAt : null;
}

function toEnemy(publicRow: EnemyPublicRow, detail?: EnemyDetailRow | null, artUrl: string | null = null): ApiEnemy {
  return {
    id: publicRow.id,
    campaign_id: publicRow.campaign_id,
    author_id: publicRow.author_id,
    name: publicRow.name,
    player_description: publicRow.player_description,
    is_revealed: publicRow.is_revealed,
    art_path: publicRow.art_path,
    art_url: artUrl,
    created_at: publicRow.created_at,
    updated_at: publicRow.updated_at,
    ...(detail ? {
      level: detail.level,
      size: detail.size,
      rarity: detail.rarity,
      traits: detail.traits,
      family: detail.family,
      origin: detail.origin,
      stat_block: parseStatBlock(detail.stat_block),
      gm_notes_markdown: detail.gm_notes_markdown,
      art_subject: detail.art_subject,
      art_prompt: detail.art_prompt,
      art_provider: detail.art_provider,
      source_provider: detail.source_provider,
      source_external_id: detail.source_external_id,
      source_content_hash: detail.source_content_hash,
      source_snapshot: detail.source_snapshot,
      source_updated_at: sourceUpdatedAt(detail),
    } : {}),
  };
}

function matchesFilters(enemy: ApiEnemy, filters: EnemyFilters = {}): boolean {
  if (filters.name && !enemy.name.toLocaleLowerCase().includes(filters.name.toLocaleLowerCase())) return false;
  if (filters.level !== undefined && enemy.level !== filters.level) return false;
  if (filters.size && enemy.size !== filters.size) return false;
  if (filters.rarity && enemy.rarity !== filters.rarity) return false;
  if (filters.trait && !(enemy.traits ?? []).some((trait) => trait.toLocaleLowerCase() === filters.trait!.toLocaleLowerCase())) return false;
  return true;
}

function sortEnemies(enemies: ApiEnemy[], sort: EnemyFilters["sort"] = "name"): ApiEnemy[] {
  return [...enemies].sort((left, right) => {
    if (sort === "level") return (left.level ?? 0) - (right.level ?? 0) || left.name.localeCompare(right.name);
    if (sort === "updated") return right.updated_at.localeCompare(left.updated_at) || left.name.localeCompare(right.name);
    return left.name.localeCompare(right.name);
  });
}

async function readEnemyDetails(supabase: SupabaseClient, campaignId: string, enemyIds: string[], columns = enemyDetailColumns): Promise<Map<string, EnemyDetailRow>> {
  if (!enemyIds.length) return new Map();
  const { data, error } = await supabase
    .from("enemy_details")
    .select(columns)
    .eq("campaign_id", campaignId)
    .in("enemy_id", enemyIds);
  if (error) throw new Error(`Unable to read campaign enemy details: ${error.message}`);
  const rows = ((data ?? []) as unknown[]).filter(isDetailRow);
  return new Map<string, EnemyDetailRow>(rows.map((detail) => [detail.enemy_id, detail]));
}

export async function readCampaignEnemiesForRole(
  supabase: SupabaseClient,
  campaignId: string,
  role: "gm" | "player",
  filters: EnemyFilters = {},
): Promise<ApiEnemy[]> {
  const { data, error } = await supabase
    .from("enemies")
    .select(enemyPublicColumns)
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw new Error(`Unable to read campaign enemies: ${error.message}`);

  const publicRows = (data ?? []) as EnemyPublicRow[];
  const details = role === "gm" ? await readEnemyDetails(supabase, campaignId, publicRows.map((enemy) => enemy.id), enemyDetailSummaryColumns) : new Map<string, EnemyDetailRow>();
  const withArt = await addCampaignArtUrls(supabase, publicRows, true);
  return sortEnemies(
    withArt.map((row) => toEnemy(row, details.get(row.id), row.art_url ?? null)).filter((enemy) => matchesFilters(enemy, filters)),
    filters.sort,
  );
}

export async function getCampaignEnemies(campaignId: string, filters: EnemyFilters = {}): Promise<CampaignEnemiesResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;
  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  return { role: membership.role, displayName: membership.displayName, enemies: await readCampaignEnemiesForRole(context.supabase, campaignId, membership.role, filters) };
}

export async function readCampaignEnemyForRole(
  supabase: SupabaseClient,
  campaignId: string,
  enemyId: string,
  role: "gm" | "player",
): Promise<ApiEnemy | null> {
  const { data, error } = await supabase
    .from("enemies")
    .select(enemyPublicColumns)
    .eq("id", enemyId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read campaign enemy: ${error.message}`);
  if (!data) return null;

  const detail = role === "gm" ? (await readEnemyDetails(supabase, campaignId, [enemyId])).get(enemyId) ?? null : null;
  const [withArt] = await addCampaignArtUrls(supabase, [data as EnemyPublicRow], true);
  return toEnemy(withArt, detail, withArt.art_url ?? null);
}

export async function getCampaignEnemy(campaignId: string, enemyId: string): Promise<CampaignEnemyResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;
  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const enemy = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, membership.role);
  if (!enemy) return null;
  return { role: membership.role, displayName: membership.displayName, enemy };
}

export function getEnemyStatBlock(enemy: ApiEnemy): EnemyStatBlockV1 | null {
  return enemy.stat_block ?? null;
}
