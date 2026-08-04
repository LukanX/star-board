import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { createCampaignSchema } from "@/lib/validation/campaign";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data, error } = await context.supabase
      .from("campaign_members")
      .select("role, display_name, campaign:campaigns(id, name, system, description, created_by)")
      .eq("user_id", context.user.id);

    if (error) {
      return NextResponse.json({ error: "Unable to load campaigns." }, { status: 503 });
    }

    return NextResponse.json({ campaigns: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = createCampaignSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Campaign details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data, error } = await context.supabase.rpc("create_campaign", {
      campaign_name: input.data.name,
      campaign_description: input.data.description,
    });

    if (error) {
      return NextResponse.json({ error: "Unable to create campaign." }, { status: 400 });
    }

    return NextResponse.json({ campaignId: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
