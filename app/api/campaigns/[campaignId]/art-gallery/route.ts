import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { listPublishedArt } from "@/lib/campaign/studio-server";
import { StudioError } from "@/lib/ai/studio-context";
import { studioJson, studioFailure } from "@/lib/ai/studio-response";

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId } = await params;
    const context = await getAuthenticatedUser();
    if (!context) throw new StudioError("Authentication is required.", 401);
    if (!await getCampaignMembership(context.supabase, campaignId, context.user.id)) throw new StudioError("Campaign membership is required.", 403);
    const url = new URL(request.url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new StudioError("Invalid gallery page.");
    return studioJson({ art: await listPublishedArt(context.supabase, campaignId, offset, url.searchParams.get("assetId") ?? undefined) });
  } catch (error) { return studioFailure(error); }
}
