import { NextResponse } from "next/server";
import { saveCampaignNarrativeSettings } from "@/lib/campaign/narrative-settings";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { campaignNarrativeSettingsSchema } from "@/lib/validation/campaign-narrative-settings";

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

  const input = campaignNarrativeSettingsSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ error: "Campaign narrative settings are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireCampaignGM(campaignId);
    if (!context) {
      return NextResponse.json({ error: "Campaign GM access is required to update narrative settings." }, { status: 403 });
    }

    const result = await saveCampaignNarrativeSettings(context.supabase, campaignId, input.data);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 503 });

    return NextResponse.json({ narrativeSettings: result.settings });
  } catch {
    return NextResponse.json({ error: "Campaign narrative settings could not be saved." }, { status: 503 });
  }
}