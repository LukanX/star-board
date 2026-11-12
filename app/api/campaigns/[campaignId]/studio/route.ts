import { requireCampaignGM } from "@/lib/auth/permissions";
import { listStudioAssets, approveStudioArt } from "@/lib/campaign/studio-server";
import { studioApprovalSchema, studioLibraryFilters, type StudioLibraryFilter } from "@/lib/validation/studio";
import { studioJson, studioFailure } from "@/lib/ai/studio-response";
import { StudioError } from "@/lib/ai/studio-context";

type Context = { params: Promise<{ campaignId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, { params }: Context) {
  try {
    const { campaignId } = await params;
    const context = await requireCampaignGM(campaignId);
    if (!context) throw new StudioError("GM access is required.", 403);
    const searchParams = new URL(request.url).searchParams;
    const offset = Number(searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new StudioError("Invalid art library page.");
    const filter = searchParams.get("filter") ?? "all";
    if (!studioLibraryFilters.includes(filter as StudioLibraryFilter)) throw new StudioError("Invalid art library filter.");
    return studioJson({ assets: await listStudioAssets(context.supabase, campaignId, offset, filter as StudioLibraryFilter) });
  } catch (error) { return studioFailure(error); }
}
export async function POST(request: Request, { params }: Context) {
  let body: unknown;
  try { body = await request.json(); } catch { return studioJson({ error: "Request body must be valid JSON." }, 400); }
  const input = studioApprovalSchema.safeParse(body);
  if (!input.success) return studioJson({ error: "Artwork approval is invalid.", issues: input.error.flatten() }, 400);
  try {
    const { campaignId } = await params;
    const context = await requireCampaignGM(campaignId);
    if (!context) throw new StudioError("GM access is required.", 403);
    const assetId = await approveStudioArt(context.supabase, campaignId, context.user.id, input.data);
    return studioJson({ assetId }, 201);
  } catch (error) { return studioFailure(error); }
}
