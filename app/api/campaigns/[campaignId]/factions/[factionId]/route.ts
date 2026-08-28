import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { validateCampaignPlace } from "@/lib/places";
import { updateFactionSchema } from "@/lib/validation/faction";

type RouteContext = { params: Promise<{ campaignId: string; factionId: string }> };

export const runtime = "nodejs";

const factionColumns = "id, author_id, name, description, status, player_notes_markdown, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId, factionId } = await params;

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
      .from("factions")
      .select(factionColumns)
      .eq("id", factionId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to load faction." }, { status: 503 });
    }

    if (!data) {
      return NextResponse.json({ error: "Faction not found." }, { status: 404 });
    }

    const { data: memberRows, error: memberError } = await context.supabase
      .from("npcs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("faction_id", factionId);

    if (memberError) {
      return NextResponse.json({ error: "Unable to load faction roster." }, { status: 503 });
    }

    let faction: typeof data & { gm_notes_markdown?: string } = data;
    if (membership.role === "gm") {
      const { data: notes, error: notesError } = await context.supabase
        .from("faction_gm_notes")
        .select("body_markdown")
        .eq("faction_id", factionId)
        .maybeSingle();

      if (notesError) {
        return NextResponse.json({ error: "Unable to load faction private notes." }, { status: 503 });
      }

      faction = { ...data, gm_notes_markdown: notes?.body_markdown ?? "" };
    }

    const [factionWithArt] = await addCampaignArtUrls(context.supabase, [faction]);
    return NextResponse.json({ role: membership.role, faction: factionWithArt, memberNpcIds: (memberRows ?? []).map((member) => member.id) });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, factionId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateFactionSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Faction update is invalid.", issues: input.error.flatten() }, { status: 400 });
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

    const placeResult = await validateCampaignPlace(context.supabase, campaignId, input.data.placeId);

    if (placeResult.unavailable) {
      return NextResponse.json({ error: "Unable to validate faction place." }, { status: 503 });
    }

    if (!placeResult.valid) {
      return NextResponse.json({ error: "Faction place must belong to this campaign." }, { status: 400 });
    }

    const { data: previousFaction, error: previousFactionError } = await context.supabase
      .from("factions")
      .select("art_path")
      .eq("id", factionId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (previousFactionError) {
      return NextResponse.json({ error: "Unable to load faction art." }, { status: 503 });
    }

    const { data: updatedFactionId, error } = await context.supabase.rpc("update_faction_with_details", {
      p_campaign_id: campaignId,
      p_faction_id: factionId,
      p_public: {
        ...(input.data.name === undefined ? {} : { name: input.data.name }),
        ...(input.data.description === undefined ? {} : { description: input.data.description }),
        ...(input.data.status === undefined ? {} : { status: input.data.status }),
        ...(input.data.playerNotesMarkdown === undefined ? {} : { playerNotesMarkdown: input.data.playerNotesMarkdown }),
        ...(input.data.placeId === undefined ? {} : { placeId: input.data.placeId }),
        ...(input.data.artSubject === undefined ? {} : { artSubject: input.data.artSubject }),
        ...(input.data.artPath === undefined ? {} : { artPath: input.data.artPath }),
        ...(input.data.artPrompt === undefined ? {} : { artPrompt: input.data.artPrompt }),
        ...(input.data.artProvider === undefined ? {} : { artProvider: input.data.artProvider }),
      },
      p_details: input.data.gmNotesMarkdown === undefined ? {} : { gmNotesMarkdown: input.data.gmNotesMarkdown },
      p_member_npc_ids: input.data.memberNpcIds ?? null,
    });

    if (error || !updatedFactionId) {
      return NextResponse.json({ error: "Unable to update faction." }, { status: 400 });
    }

    const { data: savedFaction, error: savedFactionError } = await context.supabase
      .from("factions")
      .select(factionColumns)
      .eq("id", updatedFactionId)
      .eq("campaign_id", campaignId)
      .single();

    if (savedFactionError || !savedFaction) {
      return NextResponse.json({ error: "Faction was updated, but could not be read back." }, { status: 503 });
    }

    const { data: memberRows, error: memberError } = await context.supabase
      .from("npcs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("faction_id", updatedFactionId);

    if (memberError) {
      return NextResponse.json({ error: "Faction was updated, but its roster could not be read back." }, { status: 503 });
    }

    const { data: notes, error: notesError } = await context.supabase
      .from("faction_gm_notes")
      .select("body_markdown")
      .eq("faction_id", updatedFactionId)
      .maybeSingle();

    if (notesError) {
      return NextResponse.json({ error: "Faction was updated, but its private notes could not be read back." }, { status: 503 });
    }

    if (previousFaction?.art_path !== savedFaction.art_path) {
      await removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousFaction?.art_path);
    }

    const faction: typeof savedFaction & { gm_notes_markdown: string } = { ...savedFaction, gm_notes_markdown: notes?.body_markdown ?? "" };

    const [factionWithArt] = await addCampaignArtUrls(context.supabase, [faction]);
    return NextResponse.json({ faction: factionWithArt, memberNpcIds: (memberRows ?? []).map((member) => member.id) });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, factionId } = await params;

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
      .from("factions")
      .delete()
      .eq("id", factionId)
      .eq("campaign_id", campaignId)
      .select("id, art_path")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete faction." }, { status: 400 });
    }

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, data.art_path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}