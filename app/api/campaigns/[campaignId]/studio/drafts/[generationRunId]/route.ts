import { requireCampaignGM } from "@/lib/auth/permissions";
import { StudioError } from "@/lib/ai/studio-context";
import { studioJson, studioFailure } from "@/lib/ai/studio-response";
import { campaignArtBucket } from "@/lib/storage/campaign-art";

export async function DELETE(_request: Request, { params }: { params: Promise<{ campaignId: string; generationRunId: string }> }) {
  try {
    const { campaignId, generationRunId } = await params;
    const context = await requireCampaignGM(campaignId);
    if (!context) throw new StudioError("GM access is required.", 403);
    const { data: run, error } = await context.supabase.from("ai_generation_runs").select("image_path,status")
      .eq("campaign_id", campaignId).eq("id", generationRunId).eq("requested_by", context.user.id).eq("purpose", "studio-art").maybeSingle();
    if (error) throw new StudioError("The draft could not be read.", 503);
    if (!run) throw new StudioError("The Studio draft was not found.", 404);
    if (run.status === "running" || run.status === "pending") throw new StudioError("A running provider request cannot be cancelled by discarding a draft.", 409);
    if (run.image_path) {
      const { error: removeError } = await context.supabase.storage.from(campaignArtBucket).remove([run.image_path]);
      if (removeError) throw new StudioError("The temporary image could not be removed.", 503);
    }
    const { error: updateError } = await context.supabase.from("ai_generation_runs").update({ status: "failed", error_message: "Studio draft discarded.", image_path: null, image_media_type: null })
      .eq("campaign_id", campaignId).eq("id", generationRunId).eq("requested_by", context.user.id);
    if (updateError) throw new StudioError("The discarded draft status could not be recorded.", 503);
    return studioJson({ ok: true });
  } catch (error) { return studioFailure(error); }
}
