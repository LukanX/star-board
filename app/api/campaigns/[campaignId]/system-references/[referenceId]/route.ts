import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { LibraryAccessError, loadCampaignLibraryAccess } from "@/lib/references/library-access";
import { ReferenceError } from "@/lib/references/catalog";
import { readSystemLibrary } from "@/lib/references/system-library";
import { systemReferenceSaveSchema } from "@/lib/validation/system-reference";

type RouteContext = { params: Promise<{ campaignId: string; referenceId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function PUT(request: Request, { params }: RouteContext) {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const input = systemReferenceSaveSchema.safeParse(body);
  if (!input.success) return json({ error: "Reference content is invalid.", issues: input.error.flatten() }, 400);
  const { campaignId: rawCampaignId, referenceId: rawReferenceId } = await params;
  const campaignId = z.string().uuid().safeParse(rawCampaignId);
  const referenceId = z.string().min(1).max(120).safeParse(rawReferenceId);
  if (!campaignId.success || !referenceId.success) return json({ error: "Campaign reference is invalid." }, 400);
  try {
    const context = await getAuthenticatedUser();
    if (!context) return json({ error: "Authentication is required." }, 401);
    const access = await loadCampaignLibraryAccess(context.supabase, campaignId.data);
    if (!access.canEdit) return json({ error: "Campaign library editor access is required." }, 403);
    const [entry] = await readSystemLibrary(context.supabase, [referenceId.data], campaignId.data);
    if (!entry) return json({ error: "Reference not found." }, 404);
    if ((entry.kind === "ancestry" && input.data.traitContext) || (entry.kind === "creature_trait" && (input.data.appearance || input.data.lore))) {
      return json({ error: "Content does not match this reference kind." }, 400);
    }
    const { data, error } = await context.supabase.rpc("save_system_reference", {
      p_campaign_id: campaignId.data,
      p_reference_id: referenceId.data,
      p_expected_revision: input.data.expectedRevision,
      p_appearance: input.data.appearance,
      p_lore: input.data.lore,
      p_trait_context: input.data.traitContext,
      p_source_notes: input.data.sourceNotes,
    });
    if (error) {
      if (error.code === "42501") return json({ error: "Campaign library editor access is required." }, 403);
      if (error.code === "PT409") return json({ error: "This campaign reference changed after you opened it. Your text is preserved; reload before saving." }, 409);
      if (error.code === "P0002") return json({ error: "Reference not found." }, 404);
      throw new ReferenceError("Reference content could not be saved.", 503);
    }
    return json({ revision: data });
  } catch (error) {
    console.error("campaign_system_reference_save_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    if (error instanceof LibraryAccessError) return json({ error: error.message }, error.status);
    return json({ error: error instanceof ReferenceError ? error.message : "Campaign System library is unavailable." }, error instanceof ReferenceError ? error.status : 503);
  }
}
