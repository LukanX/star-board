import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { updateCampaignDetailsSchema } from "@/lib/validation/campaign";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateCampaignDetailsSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Campaign details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireCampaignGM(campaignId);

    if (!context) {
      return NextResponse.json({ error: "Campaign GM access is required to update campaign details." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("campaigns")
      .update({ name: input.data.name, description: input.data.description, updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .select("id, name, description")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Campaign details could not be saved." }, { status: 503 });
    }

    if (!data) {
      return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    }

    return NextResponse.json({ campaign: data });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}