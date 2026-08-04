import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { updateNpcSchema } from "@/lib/validation/npc";

type RouteContext = { params: Promise<{ campaignId: string; npcId: string }> };

export const runtime = "nodejs";

const npcColumns = "id, author_id, name, species, role, description, player_notes_markdown, art_path, art_prompt, art_provider, created_at, updated_at";

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId, npcId } = await params;

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
      .eq("id", npcId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to load NPC." }, { status: 503 });
    }

    if (!data) {
      return NextResponse.json({ error: "NPC not found." }, { status: 404 });
    }

    const [npcWithArt] = await addCampaignArtUrls(context.supabase, [data]);

    if (membership.role !== "gm") {
      return NextResponse.json({ role: membership.role, npc: npcWithArt });
    }

    const { data: notes, error: notesError } = await context.supabase
      .from("npc_gm_notes")
      .select("body_markdown")
      .eq("npc_id", npcId)
      .maybeSingle();

    if (notesError) {
      return NextResponse.json({ error: "Unable to load NPC private notes." }, { status: 503 });
    }

    return NextResponse.json({ role: membership.role, npc: { ...npcWithArt, gm_notes_markdown: notes?.body_markdown ?? "" } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, npcId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateNpcSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "NPC update is invalid.", issues: input.error.flatten() }, { status: 400 });
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

    const { data: previousNpc, error: previousNpcError } = await context.supabase
      .from("npcs")
      .select("art_path")
      .eq("id", npcId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (previousNpcError) {
      return NextResponse.json({ error: "Unable to load NPC art." }, { status: 503 });
    }

    const update = {
      ...(input.data.name === undefined ? {} : { name: input.data.name }),
      ...(input.data.species === undefined ? {} : { species: input.data.species }),
      ...(input.data.role === undefined ? {} : { role: input.data.role }),
      ...(input.data.description === undefined ? {} : { description: input.data.description }),
      ...(input.data.playerNotesMarkdown === undefined ? {} : { player_notes_markdown: input.data.playerNotesMarkdown }),
      ...(input.data.artPath === undefined ? {} : { art_path: input.data.artPath }),
      ...(input.data.artPrompt === undefined ? {} : { art_prompt: input.data.artPrompt }),
      ...(input.data.artProvider === undefined ? {} : { art_provider: input.data.artProvider }),
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase
      .from("npcs")
      .update(update)
      .eq("id", npcId)
      .eq("campaign_id", campaignId)
      .select(npcColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update NPC." }, { status: 400 });
    }

    if (previousNpc?.art_path !== data.art_path) {
      await removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousNpc?.art_path);
    }

    if (input.data.gmNotesMarkdown !== undefined) {
      const { error: notesError } = await context.supabase.from("npc_gm_notes").upsert({
        npc_id: npcId,
        body_markdown: input.data.gmNotesMarkdown,
        updated_by: context.user.id,
      }, { onConflict: "npc_id" });

      if (notesError) {
        return NextResponse.json({ error: "NPC updated, but private notes could not be saved." }, { status: 400 });
      }
    }

    const gmNotesMarkdown = input.data.gmNotesMarkdown === undefined ? undefined : input.data.gmNotesMarkdown;
    const [npcWithArt] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ npc: { ...npcWithArt, ...(gmNotesMarkdown === undefined ? {} : { gm_notes_markdown: gmNotesMarkdown }) } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, npcId } = await params;

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
      .delete()
      .eq("id", npcId)
      .eq("campaign_id", campaignId)
      .select("id, art_path")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete NPC." }, { status: 400 });
    }

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, data.art_path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}