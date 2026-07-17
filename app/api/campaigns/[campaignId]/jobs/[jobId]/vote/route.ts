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

    const { data, error } = await context.supabase.rpc("cast_job_vote", {
      target_campaign_id: campaignId,
      target_job_id: jobId,
    });

    if (error) {
      return NextResponse.json({ error: "Only players can vote on an open job in this campaign." }, { status: 400 });
    }

    return NextResponse.json({ vote: data });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { error } = await context.supabase.rpc("clear_job_vote", { target_campaign_id: campaignId });

    if (error) {
      return NextResponse.json({ error: "Unable to remove the campaign vote." }, { status: 400 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
