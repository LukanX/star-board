import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignRole } from "@/lib/auth/permissions";
import { readCampaignEnemyForRole } from "@/lib/campaign/enemies-server";
import { fetchAonCreatureHtml, AonFetchError } from "@/lib/enemies/aon-fetch";
import { parseAonCreatureHtml, AonParseError } from "@/lib/enemies/aon-parser";
import { parseAonCreatureUrl } from "@/lib/enemies/aon-url";
import { createAonImportPayload, createAonSourceSnapshot } from "@/lib/enemies/aon-import";
import { hashAonCreature } from "@/lib/enemies/import-diff";
import { createCampaignArtSignedUrl, isExternalArtPath, removeCampaignArtIfUnreferenced, validateCampaignArtPath } from "@/lib/storage/campaign-art";
import { enemyReimportRequestSchema } from "@/lib/validation/enemy";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string; enemyId: string }> };

type SourceSnapshotLike = { canonicalUrl?: unknown; contentHash?: unknown };

function sourceUrlFromEnemy(enemy: { source_snapshot?: Record<string, unknown> | null }): string | null {
  const snapshot = enemy.source_snapshot as SourceSnapshotLike | null | undefined;
  return typeof snapshot?.canonicalUrl === "string" ? snapshot.canonicalUrl : null;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId, enemyId } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is valid when the stored source URL is used.
  }

  const input = enemyReimportRequestSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Enemy reimport request is invalid.", issues: input.error.flatten() }, { status: 400 });
  const expectedSourceHash = input.data.expectedSourceHash;

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (role !== "gm") return NextResponse.json({ error: "GM access is required for Archives of Nethys imports." }, { status: 403 });

    const current = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, "gm");
    if (!current) return NextResponse.json({ error: "Enemy not found." }, { status: 404 });
    if (input.data.expectedUpdatedAt !== current.updated_at) return NextResponse.json({ error: "The enemy changed after this preview was created." }, { status: 409 });
    if (!input.data.reviewedSource) return NextResponse.json({ error: "An Archives of Nethys preview must be reviewed before saving." }, { status: 400 });
    if (current.source_provider === "aon") {
      if (!current.source_content_hash) return NextResponse.json({ error: "This enemy has incomplete Archives of Nethys provenance." }, { status: 409 });
      if (current.source_external_id === null || current.source_external_id === undefined) return NextResponse.json({ error: "This enemy has incomplete Archives of Nethys provenance." }, { status: 409 });
      if (expectedSourceHash !== current.source_content_hash) return NextResponse.json({ error: "The enemy source changed after this preview was created." }, { status: 409 });
    } else if (current.source_provider || current.source_external_id !== null && current.source_external_id !== undefined || current.source_content_hash) {
      return NextResponse.json({ error: "This enemy has incomplete source provenance and cannot be safely imported." }, { status: 409 });
    } else if (expectedSourceHash !== null) {
      return NextResponse.json({ error: "A manual enemy import must use the current empty source hash." }, { status: 409 });
    }
    const sourceUrl = input.data.url ?? input.data.sourceUrl ?? sourceUrlFromEnemy(current);
    if (!sourceUrl) return NextResponse.json({ error: "This enemy has no Archives of Nethys source URL." }, { status: 400 });

    let parsedUrl;
    try {
      parsedUrl = parseAonCreatureUrl(sourceUrl);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Archives of Nethys creature URL is invalid." }, { status: 400 });
    }
    if (current.source_provider === "aon" && parsedUrl.externalId !== current.source_external_id) {
      return NextResponse.json({ error: "The requested Archives of Nethys creature does not match this enemy's existing source." }, { status: 409 });
    }
    if (input.data.preserved?.artPath && !isExternalArtPath(input.data.preserved.artPath) && !validateCampaignArtPath(campaignId, input.data.preserved.artPath)) {
      return NextResponse.json({ error: "Enemy artwork path is invalid for this campaign." }, { status: 400 });
    }

    const fetched = await fetchAonCreatureHtml(parsedUrl);
    if (fetched.url.externalId !== parsedUrl.externalId) {
      throw new AonFetchError("REDIRECT", "The Archives of Nethys redirect identified a different creature.");
    }
    const parsed = parseAonCreatureHtml(fetched.html, { canonicalUrl: fetched.url.canonicalUrl, expectedExternalId: parsedUrl.externalId });
    const sourceSnapshot = createAonSourceSnapshot(parsed, fetched.url);
    const payload = createAonImportPayload(parsed, sourceSnapshot);
    const nextHash = hashAonCreature({
      name: payload.name,
      level: payload.level,
      size: payload.size,
      rarity: payload.rarity,
      traits: payload.traits,
      family: payload.family,
      statBlock: payload.statBlock,
    });

    const reviewedPayload = input.data.reviewedSource;
    const reviewedCreatureHash = hashAonCreature({
      name: reviewedPayload.name,
      level: reviewedPayload.level,
      size: reviewedPayload.size,
      rarity: reviewedPayload.rarity,
      traits: reviewedPayload.traits,
      family: reviewedPayload.family,
      statBlock: reviewedPayload.statBlock,
    });
    if (reviewedCreatureHash !== nextHash || reviewedPayload.sourceSnapshot.contentHash !== sourceSnapshot.contentHash || reviewedPayload.sourceSnapshot.externalId !== sourceSnapshot.externalId || reviewedPayload.sourceSnapshot.canonicalUrl !== sourceSnapshot.canonicalUrl) {
      return NextResponse.json({ error: "The reviewed Archives of Nethys preview no longer matches the source." }, { status: 409 });
    }
    const preserved = input.data.preserved;
    const nextArtPath = preserved?.artPath === undefined ? current.art_path : preserved.artPath || null;
    const artChanged = current.art_path !== nextArtPath;
    if (artChanged && nextArtPath && !isExternalArtPath(nextArtPath)) {
      try {
        await createCampaignArtSignedUrl(context.supabase, nextArtPath, 3600, true);
      } catch {
        return NextResponse.json({ error: "Enemy artwork could not be verified in campaign Storage." }, { status: 400 });
      }
    }
    const { data: updatedId, error } = await context.supabase.rpc("reimport_enemy_from_source", {
      p_campaign_id: campaignId,
      p_enemy_id: enemyId,
      p_expected_source_hash: expectedSourceHash,
      p_source: payload,
      p_expected_updated_at: input.data.expectedUpdatedAt,
      p_authored: {
        playerDescription: preserved?.playerDescription ?? current.player_description,
        isRevealed: preserved?.isRevealed ?? current.is_revealed,
        artPath: nextArtPath,
        gmNotesMarkdown: preserved?.gmNotesMarkdown ?? current.gm_notes_markdown ?? "",
        artSubject: preserved?.artSubject === undefined ? (current.art_subject ?? null) : preserved.artSubject,
        artPrompt: artChanged ? null : (preserved?.artPrompt === undefined ? (current.art_prompt ?? null) : preserved.artPrompt),
        artProvider: artChanged ? null : (preserved?.artProvider === undefined ? (current.art_provider ?? null) : preserved.artProvider),
      },
    });
    if (error) return NextResponse.json({ error: error.code === "40001" ? "The enemy source changed after this preview was created." : "Unable to reimport enemy source." }, { status: error.code === "40001" ? 409 : 400 });
    if (typeof updatedId !== "string") return NextResponse.json({ error: "Enemy was reimported without an identifier." }, { status: 503 });

    const enemy = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, "gm");
    if (!enemy) return NextResponse.json({ error: "Enemy was reimported but could not be loaded." }, { status: 503 });
    if (artChanged) await removeCampaignArtIfUnreferenced(context.supabase, campaignId, current.art_path);
    return NextResponse.json({ enemy, changed: nextHash !== current.source_content_hash, warnings: parsed.warnings });
  } catch (error) {
    if (error instanceof AonFetchError || error instanceof AonParseError) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ error: "Archives of Nethys reimport is temporarily unavailable." }, { status: 503 });
  }
}
