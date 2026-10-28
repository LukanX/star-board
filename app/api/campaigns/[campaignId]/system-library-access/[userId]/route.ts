import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { LibraryAccessError, loadCampaignLibraryAccess, setCampaignLibraryEditor } from "@/lib/references/library-access";
import { campaignLibraryEditorInputSchema } from "@/lib/validation/library-access";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function PUT(request: Request, { params }: { params: Promise<{ campaignId: string; userId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const input = campaignLibraryEditorInputSchema.safeParse(body);
  const { campaignId: rawCampaignId, userId: rawUserId } = await params;
  const campaignId = z.string().uuid().safeParse(rawCampaignId);
  const userId = z.string().uuid().safeParse(rawUserId);
  if (!input.success || !campaignId.success || !userId.success) return json({ error: "Campaign library access request is invalid." }, 400);
  try {
    const context = await getAuthenticatedUser();
    if (!context) return json({ error: "Authentication is required." }, 401);
    if (!(await loadCampaignLibraryAccess(context.supabase, campaignId.data)).owner) {
      return json({ error: "Campaign owner access is required." }, 403);
    }
    return json({ member: await setCampaignLibraryEditor(context.supabase, campaignId.data, userId.data, input.data.canEdit) });
  } catch (error) {
    console.error("campaign_library_access_update_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return json(
      { error: error instanceof LibraryAccessError ? error.message : "Campaign library access is unavailable." },
      error instanceof LibraryAccessError ? error.status : 503,
    );
  }
}
