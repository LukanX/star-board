import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { visualStyleRpcMessage, visualStyleRpcStatus } from "@/lib/campaign/visual-styles";
import { removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { visualStyleUpdateInputSchema } from "@/lib/validation/visual-style";

type RouteContext = { params: Promise<{ campaignId: string; styleId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, styleId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = visualStyleUpdateInputSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Visual style is invalid.", issues: input.error.flatten() }, { status: 400 });
  if (input.data.apply && input.data.status !== "ready") return NextResponse.json({ error: "Only a ready visual style can become the campaign default." }, { status: 400 });

  try {
    const context = await requireCampaignGM(campaignId);
    if (!context) return NextResponse.json({ error: "Campaign GM access is required to manage visual styles." }, { status: 403 });

    let previousPreviewPath: string | null = null;
    if (input.data.preview) {
      const { data: currentStyle, error: currentStyleError } = await context.supabase
        .from("campaign_visual_styles")
        .select("preview_path")
        .eq("id", styleId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (currentStyleError) return NextResponse.json({ error: "The visual style could not be loaded." }, { status: 503 });
      if (!currentStyle) return NextResponse.json({ error: "The visual style was not found in this campaign." }, { status: 404 });
      previousPreviewPath = currentStyle.preview_path;
    }

    const rpcName = input.data.preview
      ? input.data.apply ? "update_and_apply_campaign_visual_style_with_preview" : "update_campaign_visual_style_with_preview"
      : input.data.apply ? "update_and_apply_campaign_visual_style" : "update_campaign_visual_style";
    const previewArgs = input.data.preview
      ? { p_generation_run_id: input.data.preview.generationRunId, p_prompt: input.data.preview.prompt }
      : {};
    const rpcArgs = input.data.apply
      ? { p_style_id: styleId, p_name: input.data.name, p_visual_style: input.data.visualStyle, p_wizard_inputs: input.data.wizardInputs, p_expected_revision: input.data.expectedRevision, ...previewArgs }
      : { p_style_id: styleId, p_name: input.data.name, p_visual_style: input.data.visualStyle, p_status: input.data.status, p_wizard_inputs: input.data.wizardInputs, p_expected_revision: input.data.expectedRevision, ...previewArgs };
    const { error } = await context.supabase.rpc(rpcName, rpcArgs);

    if (error) return NextResponse.json({ error: visualStyleRpcMessage(error, "The visual style could not be updated.") }, { status: visualStyleRpcStatus(error) });
    if (previousPreviewPath) void removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousPreviewPath);

    return NextResponse.json({ styleId });
  } catch {
    return NextResponse.json({ error: "Campaign visual styles are temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, styleId } = await params;

  try {
    const context = await requireCampaignGM(campaignId);
    if (!context) return NextResponse.json({ error: "Campaign GM access is required to manage visual styles." }, { status: 403 });

    const { data: style, error: styleError } = await context.supabase
      .from("campaign_visual_styles")
      .select("preview_path")
      .eq("id", styleId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (styleError) return NextResponse.json({ error: "The visual style could not be loaded." }, { status: 503 });

    const { error } = await context.supabase.rpc("delete_campaign_visual_style", { p_style_id: styleId });
    if (error) return NextResponse.json({ error: visualStyleRpcMessage(error, "The visual style could not be deleted.") }, { status: visualStyleRpcStatus(error) });

    if (style?.preview_path) void removeCampaignArtIfUnreferenced(context.supabase, campaignId, style.preview_path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign visual styles are temporarily unavailable." }, { status: 503 });
  }
}