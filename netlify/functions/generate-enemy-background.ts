import { generateJson } from "../../lib/ai/client";
import { getAiProviderFailure, logAiProviderFailure } from "../../lib/ai/errors";
import { enemyJobPendingTimeoutMs, enemyJobProviderTimeoutMs } from "../../lib/ai/enemy-job-lifecycle";
import { parseEnemyBackgroundJob, verifyEnemyBackgroundSignature } from "../../lib/ai/enemy-jobs";
import { getServerEnv } from "../../lib/env";
import { getSupabaseServiceRoleClient } from "../../lib/supabase/service";
import { enemyAiDraftSchema } from "../../lib/validation/enemy";

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function logWorkerEvent(event: string, fields: Record<string, unknown> = {}) {
  const eventName = `ai_enemy_worker_${event}`;
  const reason = typeof fields.reason === "string" ? `:${fields.reason}` : "";
  const detail = typeof fields.message === "string" ? fields.message : undefined;
  console.info(JSON.stringify({ ...fields, detail, event: eventName, message: `${eventName}${reason}` }));
}

async function failRun(supabase: ReturnType<typeof getSupabaseServiceRoleClient>, generationRunId: string, error: unknown) {
  const message = getAiProviderFailure(error, "Enemy generation is temporarily unavailable.").message;
  const { error: updateError } = await supabase.from("ai_generation_runs").update({
    status: "failed",
    status_updated_at: new Date().toISOString(),
    error_message: truncate(message, 500),
    draft: null,
  }).eq("id", generationRunId).eq("status", "running");

  if (updateError) {
    logWorkerEvent("failure_update_error", { generationRunId, message: updateError.message });
  }
}

export default async function handler(request: Request) {
  logWorkerEvent("invoked", { method: request.method, runtime: process.version });
  if (request.method !== "POST") {
    logWorkerEvent("rejected", { reason: "method" });
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logWorkerEvent("rejected", { reason: "invalid_json" });
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = parseEnemyBackgroundJob(body);
  if (!input.success) {
    logWorkerEvent("rejected", { reason: "invalid_job" });
    return Response.json({ error: "Enemy background job is invalid." }, { status: 400 });
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (error: unknown) {
    logWorkerEvent("configuration_error", {
      generationRunId: input.data.generationRunId,
      message: error instanceof Error ? error.message : "invalid environment configuration",
    });
    return Response.json({ error: "Enemy background generation is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("X-Star-Board-Enemy-Signature");
  if (!env.SUPABASE_SECRET_KEY || !verifyEnemyBackgroundSignature(input.data, signature, env.SUPABASE_SECRET_KEY)) {
    logWorkerEvent("rejected", {
      generationRunId: input.data.generationRunId,
      reason: env.SUPABASE_SECRET_KEY ? "invalid_signature" : "missing_secret",
      hasSignature: Boolean(signature),
    });
    return Response.json({ error: "Enemy background job is unauthorized." }, { status: 401 });
  }

  logWorkerEvent("received", { generationRunId: input.data.generationRunId, model: input.data.model });

  let supabase: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    supabase = getSupabaseServiceRoleClient();
  } catch (error: unknown) {
    logWorkerEvent("configuration_error", {
      generationRunId: input.data.generationRunId,
      message: error instanceof Error ? error.message : "unknown configuration error",
    });
    return Response.json({ error: "Enemy background storage is not configured." }, { status: 503 });
  }

  const { data: claimedRun, error: claimError } = await supabase
    .from("ai_generation_runs")
    .update({ status: "running", status_updated_at: new Date().toISOString(), error_message: null, draft: null })
    .eq("id", input.data.generationRunId)
    .eq("kind", "enemy")
    .eq("status", "pending")
    .gte("status_updated_at", new Date(Date.now() - enemyJobPendingTimeoutMs).toISOString())
    .select("id, campaign_id, requested_by")
    .maybeSingle();

  if (claimError) {
    logWorkerEvent("claim_error", { generationRunId: input.data.generationRunId, message: claimError.message });
    throw new Error("Enemy background job could not be claimed.");
  }
  if (!claimedRun) {
    logWorkerEvent("skipped", { generationRunId: input.data.generationRunId });
    return new Response(null, { status: 202 });
  }

  const startedAt = Date.now();
  logWorkerEvent("claimed", { generationRunId: claimedRun.id, model: input.data.model });

  try {
    const response = await generateJson(input.data.prompt, enemyAiDraftSchema, input.data.model, { timeoutMs: enemyJobProviderTimeoutMs });
    const draft = enemyAiDraftSchema.safeParse(response.data);
    if (!draft.success) throw new Error("The AI response did not match the enemy draft format.");

    const { data: completedRun, error: completeError } = await supabase.from("ai_generation_runs").update({
      status: "complete",
      status_updated_at: new Date().toISOString(),
      effective_model: response.model,
      generation_id: response.generationId,
      input_tokens: response.usage?.inputTokens,
      output_tokens: response.usage?.outputTokens,
      cost_usd: response.usage?.cost,
      draft: draft.data,
      error_message: null,
    }).eq("id", claimedRun.id).eq("kind", "enemy").eq("status", "running").select("id").maybeSingle();

    if (completeError) throw new Error("Enemy generation metadata could not be saved.");

    if (!completedRun) {
      logWorkerEvent("completion_skipped", { generationRunId: claimedRun.id, durationMs: Date.now() - startedAt });
    } else {
      logWorkerEvent("completed", { generationRunId: claimedRun.id, durationMs: Date.now() - startedAt });
    }
  } catch (error: unknown) {
    logAiProviderFailure(error, { kind: "enemy", campaignId: claimedRun.campaign_id, userId: claimedRun.requested_by, model: input.data.model });
    await failRun(supabase, claimedRun.id, error);
    logWorkerEvent("failed", { generationRunId: claimedRun.id, durationMs: Date.now() - startedAt });
  }

  return new Response(null, { status: 202 });
}

export const config = { background: true };