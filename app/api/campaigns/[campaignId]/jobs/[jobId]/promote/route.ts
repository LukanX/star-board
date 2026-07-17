import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";

type RouteContext = { params: Promise<{ campaignId: string; jobId: string }> };

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: RouteContext) {
  const { campaignId, jobId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data, error } = await context.supabase.rpc("promote_job_to_episode", {
      target_campaign_id: campaignId,
      target_job_id: jobId,
    });

    if (error) {
      return NextResponse.json({ error: "Only an authorized GM can promote an open job in this campaign." }, { status: 400 });
    }

    const { data: episode, error: episodeError } = await context.supabase
      .from("episodes")
      .select("id, title, status, source_job_id")
      .eq("id", data)
      .eq("campaign_id", campaignId)
      .single();

    if (episodeError) {
      return NextResponse.json({ error: "Episode was created but could not be loaded." }, { status: 503 });
    }

    return NextResponse.json({ episode }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
