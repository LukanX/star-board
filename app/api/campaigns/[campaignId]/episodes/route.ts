import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

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

    const [episodesResult, notesResult] = await Promise.all([
      context.supabase
        .from("episodes")
        .select("id, campaign_id, source_job_id, created_by, title, summary, player_context_markdown, status, started_at, completed_at, created_at, updated_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("campaign_notes")
        .select("episode_id")
        .eq("campaign_id", campaignId)
        .not("episode_id", "is", null),
    ]);

    if (episodesResult.error || notesResult.error) {
      return NextResponse.json({ error: "Unable to load campaign episodes." }, { status: 503 });
    }

    const noteCounts = new Map<string, number>();
    for (const note of notesResult.data ?? []) {
      if (note.episode_id) noteCounts.set(note.episode_id, (noteCounts.get(note.episode_id) ?? 0) + 1);
    }

    const episodes = (episodesResult.data ?? []).map((episode) => ({ ...episode, noteCount: noteCounts.get(episode.id) ?? 0 }));

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, episodes });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
