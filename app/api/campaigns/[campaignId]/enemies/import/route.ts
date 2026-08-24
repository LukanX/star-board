import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignRole } from "@/lib/auth/permissions";
import { fetchAonCreatureHtml, AonFetchError } from "@/lib/enemies/aon-fetch";
import { parseAonCreatureHtml, AonParseError } from "@/lib/enemies/aon-parser";
import { parseAonCreatureUrl } from "@/lib/enemies/aon-url";
import { createAonImportPayload, createAonPreview, createAonSourceSnapshot } from "@/lib/enemies/aon-import";
import { diffAonCreature } from "@/lib/enemies/import-diff";
import { enemyImportRequestSchema } from "@/lib/validation/enemy";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string }> };

type ExistingSource = {
  enemy_id: string;
  source_provider: "aon" | null;
  source_external_id: number | null;
  source_content_hash: string | null;
  source_snapshot: Record<string, unknown> | null;
};

function isExistingSource(value: unknown): value is ExistingSource {
  return Boolean(value && typeof value === "object" && "enemy_id" in value);
}

async function findExistingSource(supabase: Parameters<typeof getCampaignRole>[0], campaignId: string, externalId: number, existingEnemyId: string | null): Promise<ExistingSource | null> {
  let query = supabase
    .from("enemy_details")
    .select("enemy_id, source_provider, source_external_id, source_content_hash, source_snapshot")
    .eq("campaign_id", campaignId);
  query = existingEnemyId ? query.eq("enemy_id", existingEnemyId) : query.eq("source_provider", "aon").eq("source_external_id", externalId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to read existing enemy source: ${error.message}`);
  return isExistingSource(data) ? data : null;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = enemyImportRequestSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Enemy import request is invalid.", issues: input.error.flatten() }, { status: 400 });
  const sourceUrl = input.data.url ?? input.data.sourceUrl ?? "";
  const existingEnemyId = input.data.existingEnemyId ?? null;
  let parsedUrl;
  try {
    parsedUrl = parseAonCreatureUrl(sourceUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Archives of Nethys creature URL is invalid." }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (role !== "gm") return NextResponse.json({ error: "GM access is required for Archives of Nethys imports." }, { status: 403 });

    const fetched = await fetchAonCreatureHtml(parsedUrl);
    if (fetched.url.externalId !== parsedUrl.externalId) {
      throw new AonFetchError("REDIRECT", "The Archives of Nethys redirect identified a different creature.");
    }
    const parsed = parseAonCreatureHtml(fetched.html, { canonicalUrl: fetched.url.canonicalUrl, expectedExternalId: parsedUrl.externalId });
    const sourceSnapshot = createAonSourceSnapshot(parsed, fetched.url);
    const payload = createAonImportPayload(parsed, sourceSnapshot);
    const existing = await findExistingSource(context.supabase, campaignId, parsedUrl.externalId, existingEnemyId);
    if (existingEnemyId && existing?.source_provider === "aon" && existing.source_external_id !== parsedUrl.externalId) {
      return NextResponse.json({ error: "The requested Archives of Nethys creature does not match this enemy's existing source." }, { status: 409 });
    }
    const previousPayload = existing?.source_snapshot?.parsedPayload;
    const differences = diffAonCreature(
      previousPayload ? { ...(previousPayload as Record<string, unknown>), sourceSnapshot: existing?.source_snapshot } : undefined,
      { ...payload, sourceSnapshot },
    );
    const preview = createAonPreview(campaignId, payload, parsed.warnings, existing?.enemy_id ?? null, existing?.source_content_hash ?? null, differences);

    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof AonFetchError || error instanceof AonParseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Archives of Nethys import preview is temporarily unavailable." }, { status: 503 });
  }
}
