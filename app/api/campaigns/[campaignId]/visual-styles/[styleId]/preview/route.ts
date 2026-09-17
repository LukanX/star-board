import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { visualStyleRpcMessage, visualStyleRpcStatus } from "@/lib/campaign/visual-styles";
import { removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { visualStylePreviewAttachInputSchema } from "@/lib/validation/visual-style";

type RouteContext = { params: Promise<{ campaignId: string; styleId: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId, styleId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = visualStylePreviewAttachInputSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Visual style preview is invalid.", issues: input.error.flatten() }, { status: 400 });

  try {
    const context = await requireCampaignGM(campaignId);
    if (!context) return NextResponse.json({ error: "Campaign GM access is required to manage visual styles." }, { status: 403 });

    const { data: style, error: styleError } = await context.supabase
      .from("campaign_visual_styles")
      .select("visual_style, preview_path")
      .eq("id", styleId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (styleError) return NextResponse.json({ error: "The visual style could not be loaded." }, { status: 503 });
    if (!style) return NextResponse.json({ error: "The visual style was not found in this campaign." }, { status: 404 });

    const styleHash = createHash("sha256").update(style.visual_style).digest("hex");
    const { error } = await context.supabase.rpc("attach_campaign_visual_style_preview", {
      p_style_id: styleId,
      p_generation_run_id: input.data.generationRunId,
      p_prompt: input.data.prompt,
      p_style_hash: styleHash,
      p_expected_revision: input.data.expectedRevision,
    });

    if (error) return NextResponse.json({ error: visualStyleRpcMessage(error, "The style preview could not be saved.") }, { status: visualStyleRpcStatus(error) });

    if (style.preview_path) void removeCampaignArtIfUnreferenced(context.supabase, campaignId, style.preview_path);

    return NextResponse.json({ styleId });
  } catch {
    return NextResponse.json({ error: "The visual style preview is temporarily unavailable." }, { status: 503 });
  }
}
