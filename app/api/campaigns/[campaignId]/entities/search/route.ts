import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { campaignEntityPath, type EntitySection } from "@/lib/campaign/routes";

type RouteContext = { params: Promise<{ campaignId: string }> };
type EntitySearchResult = {
  id: string;
  type: EntitySection;
  label: string;
  meta: string;
  href: string;
};

export const runtime = "nodejs";

const resultLimit = 12;
const perTypeLimit = 8;

function escapeLikeSearch(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function rankResults(results: EntitySearchResult[], query: string): EntitySearchResult[] {
  const normalizedQuery = query.toLocaleLowerCase();
  return results
    .sort((left, right) => {
      const leftPrefix = left.label.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightPrefix = right.label.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      return leftPrefix - rightPrefix || left.label.localeCompare(right.label) || left.type.localeCompare(right.type);
    })
    .slice(0, resultLimit);
}

export async function GET(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const requestedAudience = searchParams.get("audience") ?? "player";
  const noteId = searchParams.get("noteId");

  if (query.length > 80) {
    return NextResponse.json({ error: "Entity search query is too long." }, { status: 400 });
  }
  if (requestedAudience !== "player" && requestedAudience !== "gm") {
    return NextResponse.json({ error: "Entity search audience is invalid." }, { status: 400 });
  }
  if (noteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(noteId)) {
    return NextResponse.json({ error: "Note reference is invalid." }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
    if (!membership) return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });

    let audience: "player" | "gm" = membership.role === "player" ? "player" : requestedAudience;
    if (noteId) {
      const { data: note, error: noteError } = await context.supabase
        .from("campaign_notes")
        .select("id, visibility")
        .eq("campaign_id", campaignId)
        .eq("id", noteId)
        .maybeSingle();

      if (noteError) return NextResponse.json({ error: "Unable to validate note access." }, { status: 503 });
      if (!note || (membership.role !== "gm" && note.visibility !== "player")) {
        return NextResponse.json({ error: "Campaign note not found." }, { status: 404 });
      }
      audience = note.visibility === "player" || requestedAudience === "player" ? "player" : "gm";
    } else if (requestedAudience === "gm" && membership.role !== "gm") {
      return NextResponse.json({ error: "GM access is required for private entity search." }, { status: 403 });
    }

    if (query.length < 2) return NextResponse.json({ entities: [] });

    const pattern = `%${escapeLikeSearch(query)}%`;
    const [characters, npcs, places, factions, jobs, enemies, episodes] = await Promise.all([
      context.supabase.from("characters").select("id, name, species, class_name").eq("campaign_id", campaignId).ilike("name", pattern).limit(perTypeLimit),
      context.supabase.from("npcs").select("id, name, species, role").eq("campaign_id", campaignId).ilike("name", pattern).limit(perTypeLimit),
      context.supabase.from("places").select("id, name, kind").eq("campaign_id", campaignId).ilike("name", pattern).limit(perTypeLimit),
      context.supabase.from("factions").select("id, name, status").eq("campaign_id", campaignId).ilike("name", pattern).limit(perTypeLimit),
      context.supabase.from("jobs").select("id, title, status").eq("campaign_id", campaignId).ilike("title", pattern).limit(perTypeLimit),
      context.supabase.from("enemies").select("id, name, is_revealed").eq("campaign_id", campaignId).ilike("name", pattern).limit(perTypeLimit),
      context.supabase.from("episodes").select("id, title, status").eq("campaign_id", campaignId).ilike("title", pattern).limit(perTypeLimit),
    ]);

    const queryResults = [characters, npcs, places, factions, jobs, enemies, episodes];
    if (queryResults.some((result) => result.error)) {
      return NextResponse.json({ error: "Unable to search campaign entities." }, { status: 503 });
    }

    const entities: EntitySearchResult[] = [
      ...(characters.data ?? []).map((entity) => ({
        id: entity.id,
        type: "characters" as const,
        label: entity.name,
        meta: [entity.species, entity.class_name].filter(Boolean).join(" // "),
      })),
      ...(npcs.data ?? []).map((entity) => ({
        id: entity.id,
        type: "npcs" as const,
        label: entity.name,
        meta: [entity.species, entity.role].filter(Boolean).join(" // "),
      })),
      ...(places.data ?? []).map((entity) => ({ id: entity.id, type: "places" as const, label: entity.name, meta: entity.kind })),
      ...(factions.data ?? []).map((entity) => ({ id: entity.id, type: "factions" as const, label: entity.name, meta: entity.status })),
      ...(jobs.data ?? [])
        .filter((entity) => audience === "gm" || entity.status !== "draft")
        .map((entity) => ({ id: entity.id, type: "jobs" as const, label: entity.title, meta: entity.status })),
      ...(enemies.data ?? [])
        .filter((entity) => audience === "gm" || entity.is_revealed)
        .map((entity) => ({ id: entity.id, type: "enemies" as const, label: entity.name, meta: "ENEMY" })),
      ...(episodes.data ?? []).map((entity) => ({ id: entity.id, type: "episodes" as const, label: entity.title, meta: entity.status })),
    ].map((entity) => ({
      ...entity,
      href: campaignEntityPath(campaignId, entity.type, entity.id),
    }));

    return NextResponse.json({ entities: rankResults(entities, query) });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}