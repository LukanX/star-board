import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { createCampaignArtSignedUrl } from "@/lib/storage/campaign-art";

type RouteContext = { params: Promise<{ generationRunId: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: RouteContext) {
  const { generationRunId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data: run, error } = await context.supabase
      .from("ai_generation_runs")
      .select("id, campaign_id, requested_by, kind, mode, target_kind, aspect_ratio, size, model, effective_model, image_path, image_media_type, created_at, status, error_message")
      .eq("id", generationRunId)
      .eq("kind", "image")
      .maybeSingle();

    if (error || !run) {
      return NextResponse.json({ error: "Image generation job was not found." }, { status: 404 });
    }

    if (run.status === "pending" || run.status === "running") {
      return NextResponse.json({ job: { generationRunId: run.id, status: run.status } });
    }

    if (run.status === "failed") {
      return NextResponse.json({ job: { generationRunId: run.id, status: run.status }, error: run.error_message ?? "Art generation is temporarily unavailable." });
    }

    if (!run.image_path || !run.image_media_type) {
      return NextResponse.json({ error: "The completed image job has no image data." }, { status: 502 });
    }

    const signedUrl = await createCampaignArtSignedUrl(context.supabase, run.image_path);

    return NextResponse.json({
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
    return NextResponse.json({ error: "Image generation status is unavailable." }, { status: 503 });
  }
}