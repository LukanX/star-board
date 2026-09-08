import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { visualStyleRpcMessage, visualStyleRpcStatus } from "@/lib/campaign/visual-styles";

type RouteContext = { params: Promise<{ campaignId: string; styleId: string }> };

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: RouteContext) {
  const { campaignId, styleId } = await params;

  try {
    const context = await requireCampaignGM(campaignId);
    if (!context) return NextResponse.json({ error: "Campaign GM access is required to manage visual styles." }, { status: 403 });

    const { error } = await context.supabase.rpc("apply_campaign_visual_style", { p_campaign_id: campaignId, p_style_id: styleId });
    if (error) return NextResponse.json({ error: visualStyleRpcMessage(error, "The visual style could not be applied.") }, { status: visualStyleRpcStatus(error) });

    return NextResponse.json({ styleId });
  } catch {
    return NextResponse.json({ error: "Campaign visual styles are temporarily unavailable." }, { status: 503 });
  }
}