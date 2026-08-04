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

    const { data, error } = await context.supabase
      .from("campaign_members")
      .select("user_id, role, display_name, joined_at")
      .eq("campaign_id", campaignId)
      .order("joined_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign members." }, { status: 503 });
    }

    const members = (data ?? []).map((member) => ({
      userId: member.user_id,
      role: member.role,
      displayName: member.display_name,
      joinedAt: member.joined_at,
    }));

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, members });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
