import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { validateCampaignPlace } from "@/lib/places";
import { updateEpisodeSchema } from "@/lib/validation/episode";

type RouteContext = { params: Promise<{ campaignId: string; episodeId: string }> };

export const runtime = "nodejs";

const episodeColumns = "id, campaign_id, source_job_id, place_id, created_by, title, summary, player_context_markdown, status, started_at, completed_at, created_at, updated_at";

function toTimestamp(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  return `${value}T00:00:00.000Z`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId, episodeId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const { data: episode, error: episodeError } = await context.supabase
      .from("episodes")
      .select(episodeColumns)
      .eq("campaign_id", campaignId)
      .eq("id", episodeId)
      .maybeSingle();

    if (episodeError) {
      return NextResponse.json({ error: "Unable to load the campaign episode." }, { status: 503 });
    }

    if (!episode) {
      return NextResponse.json({ error: "Campaign episode not found." }, { status: 404 });
    }

    const { data: notes, error: notesError } = await context.supabase
      .from("campaign_notes")
      .select("id, title, body_markdown, visibility, author_id, created_at, updated_at")
      .eq("campaign_id", campaignId)
      .eq("episode_id", episodeId)
      .order("updated_at", { ascending: false });

    if (notesError) {
      return NextResponse.json({ error: "Unable to load episode notes." }, { status: 503 });
    }

    const visibleNotes = (notes ?? []).filter((note) => membership.role === "gm" || note.visibility === "player");
    const authorIds = [...new Set(visibleNotes.map((note) => note.author_id))];
    const authorsResult = authorIds.length
      ? await context.supabase.from("profiles").select("id, display_name").in("id", authorIds)
      : { data: [], error: null };

    if (authorsResult.error) {
      return NextResponse.json({ error: "Unable to load episode note authors." }, { status: 503 });
    }

    const authors = new Map((authorsResult.data ?? []).map((author) => [author.id, author.display_name]));
    const episodeNotes = visibleNotes.map((note) => ({
      ...note,
      author: { id: note.author_id, displayName: authors.get(note.author_id) ?? "Crew member" },
      permissions: {
        canEdit: note.author_id === context.user.id || membership.role === "gm",
        canDelete: note.author_id === context.user.id || membership.role === "gm",
      },
    }));

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, episode: { ...episode, noteCount: episodeNotes.length }, notes: episodeNotes });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, episodeId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateEpisodeSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Episode details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    if (membership.role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const placeResult = await validateCampaignPlace(context.supabase, campaignId, input.data.placeId);

    if (placeResult.unavailable) {
      return NextResponse.json({ error: "Unable to validate episode place." }, { status: 503 });
    }

    if (!placeResult.valid) {
      return NextResponse.json({ error: "Episode place must belong to this campaign." }, { status: 400 });
    }

    const update = {
      ...(input.data.title === undefined ? {} : { title: input.data.title }),
      ...(input.data.summary === undefined ? {} : { summary: input.data.summary }),
      ...(input.data.playerContextMarkdown === undefined ? {} : { player_context_markdown: input.data.playerContextMarkdown }),
      ...(input.data.status === undefined ? {} : { status: input.data.status }),
      ...(input.data.startedAt === undefined ? {} : { started_at: toTimestamp(input.data.startedAt) }),
      ...(input.data.completedAt === undefined ? {} : { completed_at: toTimestamp(input.data.completedAt) }),
      ...(input.data.placeId === undefined ? {} : { place_id: input.data.placeId }),
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase
      .from("episodes")
      .update(update)
      .eq("id", episodeId)
      .eq("campaign_id", campaignId)
      .select(episodeColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update campaign episode." }, { status: 400 });
    }

    return NextResponse.json({ episode: data });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, episodeId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    if (membership.role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("episodes")
      .delete()
      .eq("id", episodeId)
      .eq("campaign_id", campaignId)
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete campaign episode." }, { status: 400 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
