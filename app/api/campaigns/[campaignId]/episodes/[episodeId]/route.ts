import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";

type RouteContext = { params: Promise<{ campaignId: string; episodeId: string }> };

export const runtime = "nodejs";

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
      .select("id, campaign_id, source_job_id, place_id, created_by, title, summary, player_context_markdown, status, started_at, completed_at, created_at, updated_at")
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
