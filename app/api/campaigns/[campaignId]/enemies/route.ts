import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { readCampaignEnemiesForRole, readCampaignEnemyForRole } from "@/lib/campaign/enemies-server";
import { createEnemySchema, enemyRaritySchema, enemySizeSchema } from "@/lib/validation/enemy";
import { createAonImportPayload, createAonSourceSnapshot } from "@/lib/enemies/aon-import";
import { fetchAonCreatureHtml, AonFetchError } from "@/lib/enemies/aon-fetch";
import { parseAonCreatureHtml, AonParseError } from "@/lib/enemies/aon-parser";
import { parseAonCreatureUrl, AonUrlError } from "@/lib/enemies/aon-url";
import { hashAonCreature } from "@/lib/enemies/import-diff";
import { createCampaignArtSignedUrl, isExternalArtPath, validateCampaignArtPath } from "@/lib/storage/campaign-art";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string }> };

function readFilters(request: Request) {
  const query = new URL(request.url).searchParams;
  const filters: Parameters<typeof readCampaignEnemiesForRole>[3] = {};
  const name = query.get("name") ?? query.get("q");
  const trait = query.get("trait") ?? query.get("type");
  const levelValue = query.get("level");
  const sizeValue = query.get("size");
  const rarityValue = query.get("rarity");
  const sortValue = query.get("sort") ?? "name";

  if (name?.trim()) filters.name = name.trim().slice(0, 160);
  if (trait?.trim()) filters.trait = trait.trim().slice(0, 48);
  if (levelValue !== null) {
    const level = Number(levelValue);
    if (!Number.isInteger(level) || level < -1 || level > 25) return { error: "Enemy level filter is invalid." };
    filters.level = level;
  }
  if (sizeValue !== null) {
    const size = enemySizeSchema.safeParse(sizeValue);
    if (!size.success) return { error: "Enemy size filter is invalid." };
    filters.size = size.data;
  }
  if (rarityValue !== null) {
    const rarity = enemyRaritySchema.safeParse(rarityValue);
    if (!rarity.success) return { error: "Enemy rarity filter is invalid." };
    filters.rarity = rarity.data;
  }
  if (sortValue !== "name" && sortValue !== "level" && sortValue !== "updated") return { error: "Enemy sort is invalid." };
  filters.sort = sortValue;
  return { filters };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const parsedFilters = readFilters(request);
  if ("error" in parsedFilters) return NextResponse.json({ error: parsedFilters.error }, { status: 400 });

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
    if (!membership) return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });

    const enemies = await readCampaignEnemiesForRole(context.supabase, campaignId, membership.role, parsedFilters.filters);
    return NextResponse.json({ role: membership.role, displayName: membership.displayName, enemies });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

function validArtPath(campaignId: string, path: string | null | undefined): boolean {
  return !path || isExternalArtPath(path) || validateCampaignArtPath(campaignId, path);
}

async function verifyReviewedAonCreate(input: ReturnType<typeof createEnemySchema.parse>) {
  if (input.origin !== "aon") return input;
  const reviewedSource = input.sourceSnapshot;
  if (!reviewedSource) throw new Error("An Archives of Nethys preview must be reviewed before saving.");

  const requestedUrl = parseAonCreatureUrl(reviewedSource.canonicalUrl);
  const fetched = await fetchAonCreatureHtml(requestedUrl);
  if (fetched.url.externalId !== requestedUrl.externalId) {
    throw new AonFetchError("REDIRECT", "The Archives of Nethys redirect identified a different creature.");
  }
  const parsed = parseAonCreatureHtml(fetched.html, { canonicalUrl: fetched.url.canonicalUrl, expectedExternalId: requestedUrl.externalId });
  const sourceSnapshot = createAonSourceSnapshot(parsed, fetched.url);
  const payload = createAonImportPayload(parsed, sourceSnapshot);
  const reviewedHash = hashAonCreature({
    name: input.name,
    level: input.level,
    size: input.size,
    rarity: input.rarity,
    traits: input.traits,
    family: input.family,
    statBlock: input.statBlock,
  });
  const fetchedHash = hashAonCreature({
    name: payload.name,
    level: payload.level,
    size: payload.size,
    rarity: payload.rarity,
    traits: payload.traits,
    family: payload.family,
    statBlock: payload.statBlock,
  });

  if (reviewedSource.contentHash !== sourceSnapshot.contentHash || reviewedSource.externalId !== sourceSnapshot.externalId || reviewedSource.canonicalUrl !== sourceSnapshot.canonicalUrl || reviewedHash !== fetchedHash) {
    throw new Error("The reviewed Archives of Nethys preview no longer matches the source.");
  }

  return {
    ...input,
    name: payload.name,
    level: payload.level,
    size: payload.size,
    rarity: payload.rarity,
    traits: payload.traits,
    family: payload.family,
    statBlock: payload.statBlock,
    sourceSnapshot,
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = createEnemySchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Enemy details are invalid.", issues: input.error.flatten() }, { status: 400 });
  if (!validArtPath(campaignId, input.data.artPath)) return NextResponse.json({ error: "Enemy artwork path is invalid for this campaign." }, { status: 400 });

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (role !== "gm") return NextResponse.json({ error: "GM access is required." }, { status: 403 });

    let verifiedInput: ReturnType<typeof createEnemySchema.parse>;
    try {
      verifiedInput = await verifyReviewedAonCreate(input.data);
    } catch (error) {
      if (error instanceof AonUrlError) return NextResponse.json({ error: error.message }, { status: 400 });
      if (error instanceof AonFetchError || error instanceof AonParseError) return NextResponse.json({ error: error.message }, { status: 502 });
      if (error instanceof Error && error.message.includes("reviewed Archives")) return NextResponse.json({ error: error.message }, { status: 409 });
      throw error;
    }

    if (verifiedInput.artPath && !isExternalArtPath(verifiedInput.artPath)) {
      try {
        await createCampaignArtSignedUrl(context.supabase, verifiedInput.artPath, 3600, true);
      } catch {
        return NextResponse.json({ error: "Enemy artwork could not be verified in campaign Storage." }, { status: 400 });
      }
    }

    const { data: enemyId, error } = await context.supabase.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId,
      p_public: {
        name: verifiedInput.name,
        playerDescription: verifiedInput.playerDescription,
        isRevealed: verifiedInput.isRevealed,
        artPath: verifiedInput.artPath ?? null,
      },
      p_details: {
        level: verifiedInput.level,
        size: verifiedInput.size,
        rarity: verifiedInput.rarity,
        traits: verifiedInput.traits,
        family: verifiedInput.family,
        statBlock: verifiedInput.statBlock,
        gmNotesMarkdown: verifiedInput.gmNotesMarkdown,
        origin: verifiedInput.origin,
        artSubject: verifiedInput.artSubject ?? null,
        artPrompt: verifiedInput.artPath ? (verifiedInput.artPrompt ?? null) : null,
        artProvider: verifiedInput.artPath ? (verifiedInput.artProvider ?? null) : null,
        sourceSnapshot: verifiedInput.sourceSnapshot ?? null,
      },
    });
    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      return NextResponse.json({ error: status === 409 ? "An enemy with this source record already exists." : "Unable to create enemy." }, { status });
    }
    if (typeof enemyId !== "string") return NextResponse.json({ error: "Enemy was created without an identifier." }, { status: 503 });

    const enemy = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, "gm");
    if (!enemy) return NextResponse.json({ error: "Enemy was created but could not be loaded." }, { status: 503 });
    return NextResponse.json({ enemy }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
