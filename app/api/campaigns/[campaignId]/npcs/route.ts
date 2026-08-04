import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import { createNpcSchema } from "@/lib/validation/npc";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const npcColumns = "id, author_id, name, species, role, description, player_notes_markdown, art_path, art_prompt, art_provider, created_at, updated_at";

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
      .from("npcs")
      .select(npcColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign NPCs." }, { status: 503 });
    }

    const npcsWithArt = await addCampaignArtUrls(context.supabase, data ?? []);

    if (membership.role !== "gm") {
      return NextResponse.json({ role: membership.role, displayName: membership.displayName, npcs: npcsWithArt });
    }

    const npcIds = (data ?? []).map((npc) => npc.id);
    const { data: notes, error: notesError } = npcIds.length
      ? await context.supabase
        .from("npc_gm_notes")
        .select("npc_id, body_markdown")
        .in("npc_id", npcIds)
      : { data: [], error: null };

    if (notesError) {
      return NextResponse.json({ error: "Unable to load NPC private notes." }, { status: 503 });
    }

    const notesByNpc = new Map((notes ?? []).map((note) => [note.npc_id, note.body_markdown]));
    const npcs = npcsWithArt.map((npc) => ({ ...npc, gm_notes_markdown: notesByNpc.get(npc.id) ?? "" }));

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, npcs });
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

  const input = createNpcSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "NPC details are invalid.", issues: input.error.flatten() }, { status: 400 });
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

    const { data, error } = await context.supabase
      .from("npcs")
      .insert({
        campaign_id: campaignId,
        author_id: context.user.id,
        name: input.data.name,
        species: input.data.species,
        role: input.data.role,
        description: input.data.description,
        player_notes_markdown: input.data.playerNotesMarkdown,
        art_path: input.data.artPath ?? null,
        art_prompt: input.data.artPrompt ?? null,
        art_provider: input.data.artProvider ?? null,
        updated_by: context.user.id,
      })
      .select(npcColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to create NPC." }, { status: 400 });
    }

    if (input.data.gmNotesMarkdown) {
      const { error: notesError } = await context.supabase.from("npc_gm_notes").insert({
        npc_id: data.id,
        body_markdown: input.data.gmNotesMarkdown,
        updated_by: context.user.id,
      });

      if (notesError) {
        return NextResponse.json({ error: "NPC created, but private notes could not be saved." }, { status: 400 });
      }
    }

    const [npc] = await addCampaignArtUrls(context.supabase, [{ ...data, gm_notes_markdown: input.data.gmNotesMarkdown }]);
    return NextResponse.json({ npc }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}