import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignRole } from "@/lib/auth/permissions";
import { readCampaignEnemyForRole } from "@/lib/campaign/enemies-server";
import { hashAonCreature } from "@/lib/enemies/import-diff";
import { createEnemySchema, updateEnemySchema } from "@/lib/validation/enemy";
import { createCampaignArtSignedUrl, isExternalArtPath, removeCampaignArtIfUnreferenced, validateCampaignArtPath } from "@/lib/storage/campaign-art";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string; enemyId: string }> };

type EnemyInput = ReturnType<typeof createEnemySchema.parse>;

function validArtPath(campaignId: string, path: string | null | undefined): boolean {
  return !path || isExternalArtPath(path) || validateCampaignArtPath(campaignId, path);
}

function toRpcPayload(input: EnemyInput) {
  const artPrompt = input.artPath ? (input.artPrompt ?? null) : null;
  const artProvider = input.artPath ? (input.artProvider ?? null) : null;
  return {
    public: {
      name: input.name,
      playerDescription: input.playerDescription,
      isRevealed: input.isRevealed,
      artPath: input.artPath ?? null,
    },
    details: {
      level: input.level,
      size: input.size,
      rarity: input.rarity,
      traits: input.traits,
      family: input.family,
      statBlock: input.statBlock,
      gmNotesMarkdown: input.gmNotesMarkdown,
      origin: input.origin,
      artSubject: input.artSubject ?? null,
      artPrompt,
      artProvider,
      sourceSnapshot: input.sourceSnapshot ?? null,
    },
  };
}

async function readCurrentEnemy(supabase: Parameters<typeof readCampaignEnemyForRole>[0], campaignId: string, enemyId: string) {
  return readCampaignEnemyForRole(supabase, campaignId, enemyId, "gm");
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId, enemyId } = await params;
  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (!role) return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });

    const enemy = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, role);
    if (!enemy) return NextResponse.json({ error: "Enemy not found." }, { status: 404 });
    return NextResponse.json({ role, enemy });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, enemyId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateEnemySchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Enemy update is invalid.", issues: input.error.flatten() }, { status: 400 });
  if (!validArtPath(campaignId, input.data.artPath)) return NextResponse.json({ error: "Enemy artwork path is invalid for this campaign." }, { status: 400 });

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (role !== "gm") return NextResponse.json({ error: "GM access is required." }, { status: 403 });

    const current = await readCurrentEnemy(context.supabase, campaignId, enemyId);
    if (!current) return NextResponse.json({ error: "Enemy not found." }, { status: 404 });
    if (input.data.expectedUpdatedAt !== current.updated_at) return NextResponse.json({ error: "The enemy changed after this edit was opened." }, { status: 409 });
    if (input.data.expectedSourceHash) return NextResponse.json({ error: "Archives of Nethys source changes must be approved through the source review endpoint." }, { status: 409 });
    if (current.level === undefined || !current.size || !current.rarity || !current.traits || !current.stat_block || !current.origin) {
      return NextResponse.json({ error: "Enemy details are incomplete and cannot be updated safely." }, { status: 409 });
    }

    const mergedResult = createEnemySchema.safeParse({
      name: input.data.name ?? current.name,
      playerDescription: input.data.playerDescription ?? current.player_description,
      isRevealed: input.data.isRevealed ?? current.is_revealed,
      artPath: input.data.artPath === undefined ? current.art_path : input.data.artPath,
      artUrl: input.data.artUrl,
      level: input.data.level ?? current.level,
      size: input.data.size ?? current.size,
      rarity: input.data.rarity ?? current.rarity,
      traits: input.data.traits ?? current.traits,
      family: input.data.family === undefined ? (current.family ?? null) : input.data.family,
      statBlock: input.data.statBlock ?? current.stat_block,
      gmNotesMarkdown: input.data.gmNotesMarkdown ?? current.gm_notes_markdown ?? "",
      origin: input.data.origin ?? current.origin,
      artSubject: input.data.artSubject === undefined ? (current.art_subject ?? null) : input.data.artSubject,
      artPrompt: input.data.artPrompt === undefined ? (current.art_prompt ?? null) : input.data.artPrompt,
      artProvider: input.data.artProvider === undefined ? (current.art_provider ?? null) : input.data.artProvider,
      sourceSnapshot: input.data.sourceSnapshot === undefined ? (current.source_snapshot ?? null) : input.data.sourceSnapshot,
    });
    if (!mergedResult.success) return NextResponse.json({ error: "Enemy update is invalid.", issues: mergedResult.error.flatten() }, { status: 400 });

    if (current.origin !== "aon" && mergedResult.data.origin === "aon") {
      return NextResponse.json({ error: "Archives of Nethys imports must be reviewed through the source import endpoint." }, { status: 409 });
    }
    if (current.origin === "aon" && mergedResult.data.origin === "aon") {
      const previousSourcePayload = current.source_snapshot && typeof current.source_snapshot === "object" && "parsedPayload" in current.source_snapshot
        ? current.source_snapshot.parsedPayload
        : { name: current.name, level: current.level, size: current.size, rarity: current.rarity, traits: current.traits, family: current.family, statBlock: current.stat_block };
      const nextSourcePayload = {
        name: mergedResult.data.name,
        level: mergedResult.data.level,
        size: mergedResult.data.size,
        rarity: mergedResult.data.rarity,
        traits: mergedResult.data.traits,
        family: mergedResult.data.family,
        statBlock: mergedResult.data.statBlock,
      };
      const previousSource = current.source_snapshot;
      const nextSource = mergedResult.data.sourceSnapshot;
      const sourceMetadataChanged = !previousSource || !nextSource || hashAonCreature(previousSource) !== hashAonCreature(nextSource);
      const sourceChanged = sourceMetadataChanged || current.source_content_hash !== nextSource?.contentHash || hashAonCreature(previousSourcePayload) !== hashAonCreature(nextSourcePayload);
      if (sourceChanged) return NextResponse.json({ error: "Archives of Nethys source changes must be reviewed before saving." }, { status: 409 });
    }

    if (current.art_path !== mergedResult.data.artPath && mergedResult.data.artPath && !isExternalArtPath(mergedResult.data.artPath)) {
      try {
        await createCampaignArtSignedUrl(context.supabase, mergedResult.data.artPath, 3600, true);
      } catch {
        return NextResponse.json({ error: "Enemy artwork could not be verified in campaign Storage." }, { status: 400 });
      }
    }

    const normalizedData = current.art_path !== mergedResult.data.artPath
      ? { ...mergedResult.data, artPrompt: null, artProvider: null }
      : mergedResult.data;
    const payload = toRpcPayload(normalizedData);
    const { data: updatedId, error } = await context.supabase.rpc("update_enemy_with_details", {
      p_campaign_id: campaignId,
      p_enemy_id: enemyId,
      p_public: payload.public,
      p_details: payload.details,
      p_expected_updated_at: current.updated_at,
      p_expected_source_hash: current.source_content_hash ?? null,
    });
    if (error) return NextResponse.json({ error: error.code === "40001" ? "The enemy changed while this edit was being saved." : "Unable to update enemy." }, { status: error.code === "23505" || error.code === "40001" ? 409 : 400 });
    if (typeof updatedId !== "string") return NextResponse.json({ error: "Enemy was updated without an identifier." }, { status: 503 });

    if (current.art_path !== mergedResult.data.artPath) await removeCampaignArtIfUnreferenced(context.supabase, campaignId, current.art_path);
    const enemy = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, "gm");
    if (!enemy) return NextResponse.json({ error: "Enemy was updated but could not be loaded." }, { status: 503 });
    return NextResponse.json({ enemy });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, enemyId } = await params;
  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (role !== "gm") return NextResponse.json({ error: "GM access is required." }, { status: 403 });

    const { data, error } = await context.supabase
      .from("enemies")
      .delete()
      .eq("id", enemyId)
      .eq("campaign_id", campaignId)
      .select("id, art_path")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to delete enemy." }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Enemy not found." }, { status: 404 });

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, data.art_path);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
