import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { updatePlaceSchema } from "@/lib/validation/place";

type RouteContext = { params: Promise<{ campaignId: string; placeId: string }> };

export const runtime = "nodejs";

const placeColumns = "id, campaign_id, author_id, parent_place_id, name, kind, description, player_notes_markdown, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

async function getParentPlaceError(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>> extends infer Context ? Context extends { supabase: infer Client } ? Client : never : never, campaignId: string, placeId: string, parentPlaceId: string | null | undefined) {
  if (!parentPlaceId) return null;

  if (parentPlaceId === placeId) return "A place cannot be its own parent.";

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
  const { campaignId, placeId } = await params;

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
      .eq("id", placeId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to load place." }, { status: 503 });
    }

    if (!data) {
      return NextResponse.json({ error: "Place not found." }, { status: 404 });
    }

    const [placeWithArt] = await addCampaignArtUrls(context.supabase, [data]);

    if (membership.role !== "gm") {
      return NextResponse.json({ role: membership.role, place: placeWithArt });
    }

    const { data: notes, error: notesError } = await context.supabase
      .from("place_gm_notes")
      .select("body_markdown")
      .eq("place_id", placeId)
      .maybeSingle();

    if (notesError) {
      return NextResponse.json({ error: "Unable to load place private notes." }, { status: 503 });
    }

    return NextResponse.json({ role: membership.role, place: { ...placeWithArt, gm_notes_markdown: notes?.body_markdown ?? "" } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, placeId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updatePlaceSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Place update is invalid.", issues: input.error.flatten() }, { status: 400 });
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

    const { data: previousPlace, error: previousPlaceError } = await context.supabase
      .from("places")
      .select("art_path")
      .eq("id", placeId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (previousPlaceError) {
      return NextResponse.json({ error: "Unable to load place art." }, { status: 503 });
    }

    if (!previousPlace) {
      return NextResponse.json({ error: "Place not found." }, { status: 404 });
    }

    const parentError = await getParentPlaceError(context.supabase, campaignId, placeId, input.data.parentPlaceId);

    if (parentError) {
      return NextResponse.json({ error: parentError }, { status: parentError.includes("Unable") ? 503 : 400 });
    }

    const update = {
      ...(input.data.name === undefined ? {} : { name: input.data.name }),
      ...(input.data.kind === undefined ? {} : { kind: input.data.kind }),
      ...(input.data.description === undefined ? {} : { description: input.data.description }),
      ...(input.data.playerNotesMarkdown === undefined ? {} : { player_notes_markdown: input.data.playerNotesMarkdown }),
      ...(input.data.parentPlaceId === undefined ? {} : { parent_place_id: input.data.parentPlaceId }),
      ...(input.data.artSubject === undefined ? {} : { art_subject: input.data.artSubject }),
      ...(input.data.artPath === undefined ? {} : { art_path: input.data.artPath }),
      ...(input.data.artPrompt === undefined ? {} : { art_prompt: input.data.artPrompt }),
      ...(input.data.artProvider === undefined ? {} : { art_provider: input.data.artProvider }),
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase
      .from("places")
      .update(update)
      .eq("id", placeId)
      .eq("campaign_id", campaignId)
      .select(placeColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update place." }, { status: 400 });
    }

    if (previousPlace.art_path !== data.art_path) {
      await removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousPlace.art_path);
    }

    let gmNotesMarkdown: string | undefined;
    if (input.data.gmNotesMarkdown !== undefined) {
      gmNotesMarkdown = input.data.gmNotesMarkdown;
      const { error: notesError } = await context.supabase.from("place_gm_notes").upsert({
        place_id: placeId,
        body_markdown: input.data.gmNotesMarkdown,
        updated_by: context.user.id,
      }, { onConflict: "place_id" });

      if (notesError) {
        return NextResponse.json({ error: "Place updated, but private notes could not be saved." }, { status: 400 });
      }
    }

    const [placeWithArt] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ place: { ...placeWithArt, ...(gmNotesMarkdown === undefined ? {} : { gm_notes_markdown: gmNotesMarkdown }) } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, placeId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("places")
      .delete()
      .eq("id", placeId)
      .eq("campaign_id", campaignId)
      .select("id, art_path")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete place." }, { status: 400 });
    }

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, data.art_path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
