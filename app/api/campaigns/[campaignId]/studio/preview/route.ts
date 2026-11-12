import { requireCampaignGM } from "@/lib/auth/permissions";
import { assembleStudioPrompt, buildStudioManifest, loadStudioSources, resolveStudioStyle, StudioError, studioOverBudgetMessage } from "@/lib/ai/studio-context";
import { imageGenerationInputSchema } from "@/lib/validation/image";
import { studioJson, studioFailure } from "@/lib/ai/studio-response";
import { loadStudioReferenceImages } from "@/lib/ai/studio-references";

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  let body: unknown;
  try { body = await request.json(); } catch { return studioJson({ error: "Request body must be valid JSON." }, 400); }
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (raw.verifyReferences !== undefined && typeof raw.verifyReferences !== "boolean") return studioJson({ error: "Reference verification is invalid." }, 400);
  // Preview may run before a direction exists so the GM can inspect and edit grounding; generation still requires one.
  const directionMissing = typeof raw.subject !== "string" || !raw.subject.trim();
  const parsed = imageGenerationInputSchema.safeParse({ ...raw, subject: directionMissing ? "[direction not written yet]" : raw.subject });
  if (!parsed.success || !parsed.data.studio || (parsed.data.targetKind !== "scene" && parsed.data.targetKind !== "battlemap"))
    return studioJson({ error: "Studio preview is invalid." }, 400);
  const input = parsed.data;
  const composition = parsed.data.studio;
  const kind = parsed.data.targetKind;
  try {
    const { campaignId } = await params;
    if (input.campaignId !== campaignId) throw new StudioError("The campaign does not match.");
    const context = await requireCampaignGM(campaignId);
    if (!context) throw new StudioError("GM access is required.", 403);
    const { style, savedStyle } = await resolveStudioStyle(context.supabase, campaignId, composition, input.visualStyleId);
    const loaded = await loadStudioSources(context.supabase, campaignId, composition);
    if (raw.verifyReferences === true && loaded.references.length) await loadStudioReferenceImages(context.supabase, campaignId, loaded.references);
    const assembly = assembleStudioPrompt(kind, buildStudioManifest(composition, input.subject ?? "", loaded, style), input.refinement);
    return studioJson({
      ...assembly,
      directionMissing,
      defaults: { style: savedStyle, subjects: loaded.defaults },
      ...(assembly.overBy > 0 ? { error: studioOverBudgetMessage(assembly.overBy) } : {}),
    }, assembly.overBy > 0 ? 422 : 200);
  } catch (error) {
    return studioFailure(error);
  }
}
