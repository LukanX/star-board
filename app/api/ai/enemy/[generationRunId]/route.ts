import { NextResponse } from "next/server";
import { getEnemyJobStaleMessage } from "@/lib/ai/enemy-job-lifecycle";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { enemyAiDraftSchema } from "@/lib/validation/enemy";

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
      .select("id, campaign_id, requested_by, kind, mode, model, effective_model, draft, created_at, status, status_updated_at, error_message")
      .eq("id", generationRunId)
      .eq("kind", "enemy")
      .maybeSingle();

    if (error || !run) {
      return noStoreJson({ error: "Enemy generation job was not found." }, { status: 404 });
    }

    if (run.status === "pending" || run.status === "running") {
      const statusUpdatedAt = run.status_updated_at ?? run.created_at;
      const staleMessage = getEnemyJobStaleMessage(run.status, statusUpdatedAt);
      if (staleMessage) {
        return noStoreJson({ job: { generationRunId: run.id, status: "failed" }, error: staleMessage });
      }

      return noStoreJson({ job: { generationRunId: run.id, status: run.status, statusUpdatedAt } });
    }

    if (run.status === "failed") {
      return noStoreJson({ job: { generationRunId: run.id, status: run.status }, error: run.error_message ?? "Enemy generation is temporarily unavailable." });
    }

    const draft = enemyAiDraftSchema.safeParse(run.draft);
    if (!draft.success) {
      return noStoreJson({ error: "The completed enemy job has no valid draft." }, { status: 502 });
    }

    return noStoreJson({
      job: {
        generationRunId: run.id,
        status: "complete",
        mode: run.mode,
        model: run.effective_model ?? run.model,
        createdAt: new Date(run.created_at).toISOString(),
        statusUpdatedAt: run.status_updated_at ?? run.created_at,
        draft: draft.data,
      },
    });
  } catch {
    return noStoreJson({ error: "Enemy generation status is unavailable." }, { status: 503 });
  }
}