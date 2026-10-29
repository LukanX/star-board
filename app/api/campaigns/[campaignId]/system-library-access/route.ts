import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { LibraryAccessError, loadCampaignLibraryAccess, readCampaignLibraryMembers } from "@/lib/references/library-access";
import { campaignLibraryDirectoryQuerySchema } from "@/lib/validation/library-access";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const campaignId = z.string().uuid().safeParse((await params).campaignId);
  if (!campaignId.success) return json({ error: "Campaign ID is invalid." }, 400);
  const input = campaignLibraryDirectoryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return json({ error: "Campaign directory query is invalid." }, 400);
  try {
    const context = await getAuthenticatedUser();
    if (!context) return json({ error: "Authentication is required." }, 401);
    if (!(await loadCampaignLibraryAccess(context.supabase, campaignId.data)).owner) {
      return json({ error: "Campaign owner access is required." }, 403);
    }
    return json(await readCampaignLibraryMembers(context.supabase, campaignId.data, input.data));
  } catch (error) {
    console.error("campaign_library_directory_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return json(
      { error: error instanceof LibraryAccessError ? error.message : "Campaign library access is unavailable." },
      error instanceof LibraryAccessError ? error.status : 503,
    );
  }
}
