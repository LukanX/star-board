import { NextResponse } from "next/server";
import { loadCampaignVisualStyles, visualStyleRpcMessage, visualStyleRpcStatus } from "@/lib/campaign/visual-styles";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { visualStyleCreateInputSchema } from "@/lib/validation/visual-style";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

async function getContext(campaignId: string) {
  const context = await requireCampaignGM(campaignId);
  if (!context) return { response: NextResponse.json({ error: "Campaign GM access is required to manage visual styles." }, { status: 403 }) };
  return { context };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  try {
    const result = await getContext(campaignId);
    if (result.response) return result.response;

    const stylesResult = await loadCampaignVisualStyles(result.context.supabase, campaignId);
    if ("error" in stylesResult) return NextResponse.json({ error: stylesResult.error }, { status: 503 });

    return NextResponse.json(stylesResult.result);
  } catch {
    return NextResponse.json({ error: "Campaign visual styles are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = visualStyleCreateInputSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Visual style is invalid.", issues: input.error.flatten() }, { status: 400 });
  if (input.data.apply && input.data.status !== "ready") return NextResponse.json({ error: "Only a ready visual style can become the campaign default." }, { status: 400 });

  try {
    const result = await getContext(campaignId);
    if (result.response) return result.response;

    const rpcName = input.data.apply ? "create_and_apply_campaign_visual_style" : "create_campaign_visual_style";
    const rpcArgs = input.data.apply
      ? { p_campaign_id: campaignId, p_name: input.data.name, p_visual_style: input.data.visualStyle, p_wizard_inputs: input.data.wizardInputs }
      : { p_campaign_id: campaignId, p_name: input.data.name, p_visual_style: input.data.visualStyle, p_status: input.data.status, p_wizard_inputs: input.data.wizardInputs };
    const { data: styleId, error } = await result.context.supabase.rpc(rpcName, rpcArgs);

    if (error) return NextResponse.json({ error: visualStyleRpcMessage(error, "The visual style could not be saved.") }, { status: visualStyleRpcStatus(error) });

    return NextResponse.json({ styleId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign visual styles are temporarily unavailable." }, { status: 503 });
  }
}