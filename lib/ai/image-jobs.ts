import { createHmac, timingSafeEqual } from "node:crypto";
import { imageBackgroundJobSchema, type ImageBackgroundJob } from "@/lib/validation/image";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const imageBackgroundFunctionName = "generate-image-background";

function canonicalImageBackgroundJob(job: ImageBackgroundJob) {
  return {
    generationRunId: job.generationRunId,
    prompt: job.prompt,
    model: job.model,
    purpose: job.purpose ?? "entity-art",
    aspectRatio: job.aspectRatio,
    size: job.size,
  };
}

export function createImageBackgroundSignature(job: ImageBackgroundJob, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify(canonicalImageBackgroundJob(job))).digest("hex");
}

export function verifyImageBackgroundSignature(job: ImageBackgroundJob, signature: string | null, secret: string) {
  if (!signature) return false;

  const expected = createImageBackgroundSignature(job, secret);
  const received = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");

  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}

export async function dispatchImageBackgroundJob(requestUrl: string, job: ImageBackgroundJob, secret: string) {
  const response = await fetch(new URL(`/.netlify/functions/${imageBackgroundFunctionName}`, requestUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Star-Board-Image-Signature": createImageBackgroundSignature(job, secret),
    },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Image background function returned HTTP ${response.status}.`);
  }
}

export async function markImageBackgroundDispatchFailed(input: {
  campaignId: string;
  generationRunId: string;
  requestedBy: string;
  targetCharacterId: string | null;
}) {
  const supabase = getSupabaseServiceRoleClient();
  let query = supabase
    .from("ai_generation_runs")
    .update({
      status: "failed",
      status_updated_at: new Date().toISOString(),
      error_message: "The image background worker could not be reached.",
    })
    .eq("id", input.generationRunId)
    .eq("campaign_id", input.campaignId)
    .eq("requested_by", input.requestedBy)
    .eq("status", "pending");

  query = input.targetCharacterId
    ? query.eq("target_character_id", input.targetCharacterId)
    : query.is("target_character_id", null);

  const { error } = await query;
  if (error) throw new Error("The image background failure could not be recorded.");
}

export function parseImageBackgroundJob(body: unknown) {
  return imageBackgroundJobSchema.safeParse(body);
}