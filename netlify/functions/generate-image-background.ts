import { generateImage } from "../../lib/ai/client";
import { getAiProviderFailure, logAiProviderFailure } from "../../lib/ai/errors";
import { imageJobPendingTimeoutMs, imageJobProviderTimeoutMs } from "../../lib/ai/image-job-lifecycle";
import { parseImageBackgroundJob, verifyImageBackgroundSignature } from "../../lib/ai/image-jobs";
import { getServerEnv } from "../../lib/env";
import { campaignArtBucket } from "../../lib/storage/campaign-art";
import { getSupabaseServiceRoleClient } from "../../lib/supabase/service";

const imageMediaTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

type StoredImage = {
  body: Blob;
  mediaType: keyof typeof imageMediaTypes;
};

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

async function getStoredImage(image: Awaited<ReturnType<typeof generateImage>>["image"]): Promise<StoredImage> {
  if (image.base64) {
    const mediaType = imageMediaTypes[image.mediaType as keyof typeof imageMediaTypes] ? image.mediaType as keyof typeof imageMediaTypes : null;
    if (!mediaType) throw new Error("The AI provider returned an unsupported image type.");

    return { body: new Blob([Buffer.from(image.base64, "base64")], { type: mediaType }), mediaType };
  }

  if (!image.url) throw new Error("The AI provider returned no image data.");

  const response = await fetch(image.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`The generated image could not be downloaded (HTTP ${response.status}).`);

  const responseMediaType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  const declaredMediaType = image.mediaType in imageMediaTypes ? image.mediaType as keyof typeof imageMediaTypes : null;
  const mediaType = responseMediaType && responseMediaType in imageMediaTypes ? responseMediaType as keyof typeof imageMediaTypes : declaredMediaType;
  if (!mediaType) throw new Error("The generated image has an unsupported media type.");

  return { body: await response.blob(), mediaType };
}

function logWorkerEvent(event: string, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event: `ai_image_worker_${event}`, ...fields }));
}

async function failRun(supabase: ReturnType<typeof getSupabaseServiceRoleClient>, generationRunId: string, error: unknown) {
  const message = getAiProviderFailure(error, "Art generation is temporarily unavailable.").message;
  const { error: updateError } = await supabase.from("ai_generation_runs").update({
    status: "failed",
    status_updated_at: new Date().toISOString(),
    error_message: truncate(message, 500),
  }).eq("id", generationRunId).eq("status", "running");

  if (updateError) {
    logWorkerEvent("failure_update_error", { generationRunId, message: updateError.message });
  }
}

export default async function handler(request: Request) {
  logWorkerEvent("invoked", { method: request.method });
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

  const input = parseImageBackgroundJob(body);
  if (!input.success) {
    logWorkerEvent("rejected", { reason: "invalid_job" });
    return Response.json({ error: "Image background job is invalid." }, { status: 400 });
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (error: unknown) {
    logWorkerEvent("configuration_error", {
      generationRunId: input.data.generationRunId,
      message: error instanceof Error ? error.message : "invalid environment configuration",
    });
    return Response.json({ error: "Image background storage is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("X-Star-Board-Image-Signature");
  if (!env.SUPABASE_SECRET_KEY || !verifyImageBackgroundSignature(input.data, signature, env.SUPABASE_SECRET_KEY)) {
    logWorkerEvent("rejected", {
      generationRunId: input.data.generationRunId,
      reason: env.SUPABASE_SECRET_KEY ? "invalid_signature" : "missing_secret",
      hasSignature: Boolean(signature),
    });
    return Response.json({ error: "Image background job is unauthorized." }, { status: 401 });
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
    return Response.json({ error: "Image background storage is not configured." }, { status: 503 });
  }

  const { data: claimedRun, error: claimError } = await supabase
    .from("ai_generation_runs")
    .update({ status: "running", status_updated_at: new Date().toISOString(), error_message: null })
    .eq("id", input.data.generationRunId)
    .eq("status", "pending")
    .gte("status_updated_at", new Date(Date.now() - imageJobPendingTimeoutMs).toISOString())
    .select("id, campaign_id, requested_by")
    .maybeSingle();

  if (claimError) {
    logWorkerEvent("claim_error", { generationRunId: input.data.generationRunId, message: claimError.message });
    throw new Error("Image background job could not be claimed.");
  }
  if (!claimedRun) {
    logWorkerEvent("skipped", { generationRunId: input.data.generationRunId });
    return new Response(null, { status: 202 });
  }

  const startedAt = Date.now();
  logWorkerEvent("claimed", { generationRunId: claimedRun.id, model: input.data.model });

  try {
    const response = await generateImage(input.data.prompt, input.data.model, { aspectRatio: input.data.aspectRatio, size: input.data.size, timeoutMs: imageJobProviderTimeoutMs });
    const storedImage = await getStoredImage(response.image);
    const path = `${claimedRun.campaign_id}/${claimedRun.requested_by}/image-${claimedRun.id}.${imageMediaTypes[storedImage.mediaType]}`;
    const { error: uploadError } = await supabase.storage.from(campaignArtBucket).upload(path, storedImage.body, {
      cacheControl: "3600",
      contentType: storedImage.mediaType,
      upsert: false,
    });

    if (uploadError) throw new Error("The generated image could not be stored.");

    const { data: completedRun, error: completeError } = await supabase.from("ai_generation_runs").update({
      status: "complete",
      status_updated_at: new Date().toISOString(),
      effective_model: response.model,
      generation_id: response.generationId,
      input_tokens: response.usage?.inputTokens,
      output_tokens: response.usage?.outputTokens,
      cost_usd: response.usage?.cost,
      image_path: path,
      image_media_type: storedImage.mediaType,
      error_message: null,
    }).eq("id", claimedRun.id).eq("status", "running").select("id").maybeSingle();

    if (completeError) {
      await supabase.storage.from(campaignArtBucket).remove([path]);
      throw new Error("Image generation metadata could not be saved.");
    }

    if (!completedRun) {
      await supabase.storage.from(campaignArtBucket).remove([path]);
      logWorkerEvent("completion_skipped", { generationRunId: claimedRun.id, durationMs: Date.now() - startedAt });
    } else {
      logWorkerEvent("completed", { generationRunId: claimedRun.id, durationMs: Date.now() - startedAt });
    }
  } catch (error: unknown) {
    logAiProviderFailure(error, { kind: "image", campaignId: claimedRun.campaign_id, userId: claimedRun.requested_by, model: input.data.model });
    await failRun(supabase, claimedRun.id, error);
    logWorkerEvent("failed", { generationRunId: claimedRun.id, durationMs: Date.now() - startedAt });
  }

  return new Response(null, { status: 202 });
}

export const config = { background: true };