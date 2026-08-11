import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { updateFactionSchema } from "@/lib/validation/faction";

type RouteContext = { params: Promise<{ campaignId: string; factionId: string }> };

export const runtime = "nodejs";

const factionColumns = "id, author_id, name, description, status, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

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

    const [faction] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ role: membership.role, faction });
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

    const { data: previousFaction, error: previousFactionError } = await context.supabase
      .from("factions")
      .select("art_path")
      .eq("id", factionId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (previousFactionError) {
      return NextResponse.json({ error: "Unable to load faction art." }, { status: 503 });
    }

    const update = {
      ...(input.data.name === undefined ? {} : { name: input.data.name }),
      ...(input.data.description === undefined ? {} : { description: input.data.description }),
      ...(input.data.status === undefined ? {} : { status: input.data.status }),
      ...(input.data.artSubject === undefined ? {} : { art_subject: input.data.artSubject }),
      ...(input.data.artPath === undefined ? {} : { art_path: input.data.artPath }),
      ...(input.data.artPrompt === undefined ? {} : { art_prompt: input.data.artPrompt }),
      ...(input.data.artProvider === undefined ? {} : { art_provider: input.data.artProvider }),
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase
      .from("factions")
      .update(update)
      .eq("id", factionId)
      .eq("campaign_id", campaignId)
      .select(factionColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update faction." }, { status: 400 });
    }

    if (previousFaction?.art_path !== data.art_path) {
      await removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousFaction?.art_path);
    }

    const [faction] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ faction });
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