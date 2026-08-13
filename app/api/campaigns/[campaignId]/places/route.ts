import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import { createPlaceSchema } from "@/lib/validation/place";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const placeColumns = "id, campaign_id, author_id, parent_place_id, name, kind, description, player_notes_markdown, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

async function getParentPlaceError(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>> extends infer Context ? Context extends { supabase: infer Client } ? Client : never : never, campaignId: string, parentPlaceId: string | null | undefined) {
  if (!parentPlaceId) return null;

  const { data, error } = await supabase
    .from("places")
    .select("id")
    .eq("id", parentPlaceId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) return "Unable to validate place parent.";
  if (!data) return "Place parent must belong to this campaign.";
  return null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("places")
      .select(placeColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign places." }, { status: 503 });
    }

    const placesWithArt = await addCampaignArtUrls(context.supabase, data ?? []);
    const placeIds = (data ?? []).map((place) => place.id);
    const { data: notes, error: notesError } = membership.role === "gm" && placeIds.length
      ? await context.supabase.from("place_gm_notes").select("place_id, body_markdown").in("place_id", placeIds)
      : { data: [], error: null };

    if (notesError) {
      return NextResponse.json({ error: "Unable to load place private notes." }, { status: 503 });
    }

    const notesByPlace = new Map((notes ?? []).map((note) => [note.place_id, note.body_markdown]));
    const places = placesWithArt.map((place) => membership.role === "gm"
      ? { ...place, gm_notes_markdown: notesByPlace.get(place.id) ?? "" }
      : place);

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, places });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = createPlaceSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Place details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const parentError = await getParentPlaceError(context.supabase, campaignId, input.data.parentPlaceId);

    if (parentError) {
      return NextResponse.json({ error: parentError }, { status: parentError.includes("Unable") ? 503 : 400 });
    }

    const { data, error } = await context.supabase
      .from("places")
      .insert({
        campaign_id: campaignId,
        author_id: context.user.id,
        parent_place_id: input.data.parentPlaceId ?? null,
        name: input.data.name,
        kind: input.data.kind,
        description: input.data.description,
        player_notes_markdown: input.data.playerNotesMarkdown,
        art_subject: input.data.artSubject ?? null,
        art_path: input.data.artPath ?? null,
        art_prompt: input.data.artPrompt ?? null,
        art_provider: input.data.artProvider ?? null,
        updated_by: context.user.id,
      })
      .select(placeColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to create place." }, { status: 400 });
    }

    if (input.data.gmNotesMarkdown) {
      const { error: notesError } = await context.supabase.from("place_gm_notes").insert({
        place_id: data.id,
        body_markdown: input.data.gmNotesMarkdown,
        updated_by: context.user.id,
      });

      if (notesError) {
        return NextResponse.json({ error: "Place created, but private notes could not be saved." }, { status: 400 });
      }
    }

    const [place] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ place: { ...place, gm_notes_markdown: input.data.gmNotesMarkdown } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
