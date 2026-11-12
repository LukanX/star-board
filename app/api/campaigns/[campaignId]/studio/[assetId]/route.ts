import { requireCampaignGM } from "@/lib/auth/permissions";
import { manageStudioArt } from "@/lib/campaign/studio-server";
import { studioAssetActionSchema } from "@/lib/validation/studio";
import { studioJson, studioFailure } from "@/lib/ai/studio-response";
import { StudioError } from "@/lib/ai/studio-context";

export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ campaignId: string; assetId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return studioJson({ error: "Request body must be valid JSON." }, 400); }
  const input = studioAssetActionSchema.safeParse(body);
  if (!input.success) return studioJson({ error: "Artwork action is invalid.", issues: input.error.flatten() }, 400);
  try {
    const { campaignId, assetId } = await params;
    const context = await requireCampaignGM(campaignId);
    if (!context) throw new StudioError("GM access is required.", 403);
    await manageStudioArt(context.supabase, campaignId, context.user.id, assetId, input.data);
    return studioJson({ ok: true });
  } catch (error) { return studioFailure(error); }
}
