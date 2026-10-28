import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignRole } from "@/lib/auth/permissions";
import { ReferenceError } from "@/lib/references/catalog";
import { readSystemReferenceSettings } from "@/lib/references/system-library";
import { systemReferenceSettingsSchema } from "@/lib/validation/system-reference";

type Context = { params: Promise<{ campaignId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function handle(request: Request, { params }: Context, write: boolean) {
  let input;
  if (write) {
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
    input = systemReferenceSettingsSchema.safeParse(body);
    if (!input.success) return json({ error: "System reference settings are invalid." }, 400);
  }
  try {
    const context = await getAuthenticatedUser();
    if (!context) return json({ error: "Authentication is required." }, 401);
    const { campaignId } = await params;
    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (!role || (write && role !== "gm")) return json({ error: write ? "Campaign GM access is required." : "Campaign membership is required." }, 403);
    if (input?.success) {
      const { error } = await context.supabase.from("campaign_system_reference_settings").upsert({
        campaign_id: campaignId, appearance: input.data.appearance, lore: input.data.lore, creature_traits: input.data.creatureTraits,
        updated_by: context.user.id, updated_at: new Date().toISOString(),
      });
      if (error) throw new ReferenceError("System reference settings could not be saved.", 503);
    }
    return json({ settings: await readSystemReferenceSettings(context.supabase, campaignId) });
  } catch (error) {
    console.error("system_reference_settings_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return json({ error: error instanceof ReferenceError ? error.message : "System reference settings are unavailable." }, 503);
  }
}
export const GET = (request: Request, context: Context) => handle(request, context, false);
export const PUT = (request: Request, context: Context) => handle(request, context, true);
