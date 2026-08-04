import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { updateCampaignMemberSchema } from "@/lib/validation/membership";

type RouteContext = { params: Promise<{ campaignId: string; userId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, userId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateCampaignMemberSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Member role is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireCampaignGM(campaignId);

    if (!context) {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const { data: target, error: targetError } = await context.supabase
      .from("campaign_members")
      .select("user_id, role, display_name, joined_at")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: "Unable to load campaign member." }, { status: 503 });
    }

    if (!target) {
      return NextResponse.json({ error: "Campaign member not found." }, { status: 404 });
    }

    if (target.user_id === context.user.id) {
      return NextResponse.json({ error: "You cannot change your own campaign role." }, { status: 400 });
    }

    if (target.role === "gm" && input.data.role === "player") {
      const { count, error: countError } = await context.supabase
        .from("campaign_members")
        .select("user_id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("role", "gm");

      if (countError) {
        return NextResponse.json({ error: "Unable to verify campaign GM coverage." }, { status: 503 });
      }

      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "A campaign must keep at least one GM." }, { status: 400 });
      }
    }

    const { data: member, error } = await context.supabase
      .from("campaign_members")
      .update({ role: input.data.role })
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .select("user_id, role, display_name, joined_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update campaign member." }, { status: 400 });
    }

    return NextResponse.json({ member: { userId: member.user_id, role: member.role, displayName: member.display_name, joinedAt: member.joined_at } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, userId } = await params;

  try {
    const context = await requireCampaignGM(campaignId);

    if (!context) {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    if (userId === context.user.id) {
      return NextResponse.json({ error: "You cannot remove yourself from the campaign." }, { status: 400 });
    }

    const { data: target, error: targetError } = await context.supabase
      .from("campaign_members")
      .select("user_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: "Unable to load campaign member." }, { status: 503 });
    }

    if (!target) {
      return NextResponse.json({ error: "Campaign member not found." }, { status: 404 });
    }

    const { error } = await context.supabase
      .from("campaign_members")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Unable to remove campaign member." }, { status: 400 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
