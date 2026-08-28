import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import { validateCampaignPlace } from "@/lib/places";
import { createFactionSchema } from "@/lib/validation/faction";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const factionColumns = "id, author_id, name, description, status, player_notes_markdown, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

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
      .from("factions")
      .select(factionColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign factions." }, { status: 503 });
    }

    const factionsWithArt = await addCampaignArtUrls(context.supabase, data ?? []);
    if (membership.role !== "gm") {
      return NextResponse.json({ role: membership.role, displayName: membership.displayName, factions: factionsWithArt });
    }

    const factionIds = (data ?? []).map((faction) => faction.id);
    const { data: notes, error: notesError } = factionIds.length
      ? await context.supabase
        .from("faction_gm_notes")
        .select("faction_id, body_markdown")
        .in("faction_id", factionIds)
      : { data: [], error: null };

    if (notesError) {
      return NextResponse.json({ error: "Unable to load faction private notes." }, { status: 503 });
    }

    const notesByFaction = new Map((notes ?? []).map((note) => [note.faction_id, note.body_markdown]));
    const factions = factionsWithArt.map((faction) => ({ ...faction, gm_notes_markdown: notesByFaction.get(faction.id) ?? "" }));
    return NextResponse.json({ role: membership.role, displayName: membership.displayName, factions });
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

  const input = createFactionSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Faction details are invalid.", issues: input.error.flatten() }, { status: 400 });
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

    const { data: factionId, error } = await context.supabase.rpc("create_faction_with_details", {
      p_campaign_id: campaignId,
      p_public: {
        name: input.data.name,
        description: input.data.description,
        status: input.data.status,
        playerNotesMarkdown: input.data.playerNotesMarkdown,
        placeId: input.data.placeId ?? null,
        artSubject: input.data.artSubject ?? null,
        artPath: input.data.artPath ?? null,
        artPrompt: input.data.artPrompt ?? null,
        artProvider: input.data.artProvider ?? null,
      },
      p_details: { gmNotesMarkdown: input.data.gmNotesMarkdown },
      p_member_npc_ids: input.data.memberNpcIds,
    });

    if (error || !factionId) {
      return NextResponse.json({ error: "Unable to create faction." }, { status: 400 });
    }

    const { data: savedFaction, error: savedFactionError } = await context.supabase
      .from("factions")
      .select(factionColumns)
      .eq("id", factionId)
      .eq("campaign_id", campaignId)
      .single();

    if (savedFactionError || !savedFaction) {
      return NextResponse.json({ error: "Faction was created, but could not be read back." }, { status: 503 });
    }

    const { data: memberRows, error: memberError } = await context.supabase
      .from("npcs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("faction_id", factionId);

    if (memberError) {
      return NextResponse.json({ error: "Faction was created, but its roster could not be read back." }, { status: 503 });
    }

    const { data: notes, error: notesError } = await context.supabase
      .from("faction_gm_notes")
      .select("body_markdown")
      .eq("faction_id", factionId)
      .maybeSingle();

    if (notesError) {
      return NextResponse.json({ error: "Faction was created, but its private notes could not be read back." }, { status: 503 });
    }

    const [faction] = await addCampaignArtUrls(context.supabase, [{ ...savedFaction, gm_notes_markdown: notes?.body_markdown ?? "" }]);
    return NextResponse.json({ faction, memberNpcIds: (memberRows ?? []).map((member) => member.id) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}