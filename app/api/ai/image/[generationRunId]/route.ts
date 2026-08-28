import { NextResponse } from "next/server";
import { getImageJobStaleMessage } from "@/lib/ai/image-job-lifecycle";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { createCampaignArtSignedUrl } from "@/lib/storage/campaign-art";

type RouteContext = { params: Promise<{ generationRunId: string }> };

export const runtime = "nodejs";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { generationRunId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return noStoreJson({ error: "Authentication is required." }, { status: 401 });
    }

    const { data: run, error } = await context.supabase
      .from("ai_generation_runs")
      .select("id, campaign_id, requested_by, kind, mode, target_kind, aspect_ratio, size, model, effective_model, image_path, image_media_type, created_at, status, status_updated_at, error_message")
      .eq("id", generationRunId)
      .eq("kind", "image")
      .maybeSingle();

    if (error || !run) {
      return noStoreJson({ error: "Image generation job was not found." }, { status: 404 });
    }

    if (run.status === "pending" || run.status === "running") {
      const statusUpdatedAt = run.status_updated_at ?? run.created_at;
      const staleMessage = getImageJobStaleMessage(run.status, statusUpdatedAt);
      if (staleMessage) {
        return noStoreJson({ job: { generationRunId: run.id, status: "failed" }, error: staleMessage });
      }

      return noStoreJson({ job: { generationRunId: run.id, status: run.status, statusUpdatedAt } });
    }

    if (run.status === "failed") {
      return noStoreJson({ job: { generationRunId: run.id, status: run.status }, error: run.error_message ?? "Art generation is temporarily unavailable." });
    }

    if (!run.image_path || !run.image_media_type) {
      return noStoreJson({ error: "The completed image job has no image data." }, { status: 502 });
    }

    const signedUrl = run.target_kind === "enemy"
      ? await createCampaignArtSignedUrl(context.supabase, run.image_path, 3600, true)
      : await createCampaignArtSignedUrl(context.supabase, run.image_path);

    return noStoreJson({
      job: {
        generationRunId: run.id,
        status: "complete",
        targetKind: run.target_kind,
        mode: run.mode,
        aspectRatio: run.aspect_ratio,
        size: run.size,
        model: run.effective_model ?? run.model,
        createdAt: new Date(run.created_at).toISOString(),
        temporaryPath: run.image_path,
        image: { base64: null, url: signedUrl, mediaType: run.image_media_type },
      },
    });
  } catch {
    return noStoreJson({ error: "Image generation status is unavailable." }, { status: 503 });
  }
}