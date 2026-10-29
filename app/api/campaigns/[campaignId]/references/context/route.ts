import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { ReferenceError } from "@/lib/references/catalog";
import { inspectSystemReferenceContext } from "@/lib/references/system-library";
import { referenceBindingSchema, creatureTraitBindingSchema } from "@/lib/validation/reference";
import { loadCharacterPortraitAccess } from "@/lib/ai/character-portrait-access";
import { readReferenceBinding } from "@/lib/references/types";
import type { LibrarySelection } from "@/lib/references/system-library";

const inputSchema = z.object({
  purpose: z.enum(["text", "image"]),
  characterId: z.string().uuid().optional(),
  selections: z.array(z.object({
    kind: z.enum(["ancestry", "class", "creature_trait"]),
    binding: z.union([referenceBindingSchema, creatureTraitBindingSchema]).nullable(),
  }).strict()).max(34).refine((values) => new Set(values.filter((value) => value.binding).map((value) => value.binding!.id)).size === values.filter((value) => value.binding).length),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const input = inputSchema.safeParse(body);
  if (!input.success) return json({ error: "Context preview request is invalid." }, 400);
  try {
    const context = await getAuthenticatedUser();
    if (!context) return json({ error: "Authentication is required." }, 401);
    const { campaignId } = await params;
    if (!await getCampaignMembership(context.supabase, campaignId, context.user.id)) return json({ error: "Campaign membership is required." }, 403);
    let selections: LibrarySelection[] = input.data.selections;
    if (input.data.characterId) {
      const access = await loadCharacterPortraitAccess(context.supabase, campaignId, input.data.characterId, context.user.id);
      if (!access.access) return json({ error: "Saved character portrait access is required." }, access.failure === "not-found" ? 404 : 403);
      selections = [{ kind: "ancestry", binding: readReferenceBinding(access.access.character, "ancestry") }];
      if (input.data.purpose === "text") selections.push({ kind: "class", binding: readReferenceBinding(access.access.character, "class") });
    }
    const result = await inspectSystemReferenceContext(context.supabase, campaignId, selections, input.data.purpose);
    return json({ sources: result.sources, promptCharacters: result.text.length, availability: result.availability });
  } catch (error) {
    console.error("system_context_preview_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return json({ error: error instanceof ReferenceError ? error.message : "System context could not be checked." }, error instanceof ReferenceError ? error.status : 503);
  }
}
