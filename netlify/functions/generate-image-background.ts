import { generateImage } from "../../lib/ai/client";
import { getAiProviderFailure, logAiProviderFailure } from "../../lib/ai/errors";
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

async function failRun(supabase: ReturnType<typeof getSupabaseServiceRoleClient>, generationRunId: string, error: unknown) {
  const message = getAiProviderFailure(error, "Art generation is temporarily unavailable.").message;
  await supabase.from("ai_generation_runs").update({ status: "failed", error_message: truncate(message, 500) }).eq("id", generationRunId);
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = parseImageBackgroundJob(body);
  if (!input.success) return Response.json({ error: "Image background job is invalid." }, { status: 400 });

  const env = getServerEnv();
  if (!env.SUPABASE_SECRET_KEY || !verifyImageBackgroundSignature(input.data, request.headers.get("X-Star-Board-Image-Signature"), env.SUPABASE_SECRET_KEY)) {
    return Response.json({ error: "Image background job is unauthorized." }, { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseServiceRoleClient>;
  try {
    supabase = getSupabaseServiceRoleClient();
  } catch {
    return Response.json({ error: "Image background storage is not configured." }, { status: 503 });
  }

  const { data: claimedRun, error: claimError } = await supabase
    .from("ai_generation_runs")
    .update({ status: "running", error_message: null })
    .eq("id", input.data.generationRunId)
    .eq("status", "pending")
    .select("id, campaign_id, requested_by")
    .maybeSingle();

  if (claimError) return Response.json({ error: "Image background job could not be claimed." }, { status: 503 });
  if (!claimedRun) return new Response(null, { status: 202 });

  try {
    const response = await generateImage(input.data.prompt, input.data.model, { aspectRatio: input.data.aspectRatio, size: input.data.size, timeoutMs: 14 * 60 * 1000 });
    const storedImage = await getStoredImage(response.image);
    const path = `${claimedRun.campaign_id}/${claimedRun.requested_by}/image-${claimedRun.id}.${imageMediaTypes[storedImage.mediaType]}`;
    const { error: uploadError } = await supabase.storage.from(campaignArtBucket).upload(path, storedImage.body, {
      cacheControl: "3600",
      contentType: storedImage.mediaType,
      upsert: false,
    });

    if (uploadError) throw new Error("The generated image could not be stored.");

    const { error: completeError } = await supabase.from("ai_generation_runs").update({
      status: "complete",
      effective_model: response.model,
      generation_id: response.generationId,
      input_tokens: response.usage?.inputTokens,
      output_tokens: response.usage?.outputTokens,
      cost_usd: response.usage?.cost,
      image_path: path,
      image_media_type: storedImage.mediaType,
      error_message: null,
    }).eq("id", claimedRun.id);

    if (completeError) {
      await supabase.storage.from(campaignArtBucket).remove([path]);
      throw new Error("Image generation metadata could not be saved.");
    }
  } catch (error: unknown) {
    logAiProviderFailure(error, { kind: "image", campaignId: claimedRun.campaign_id, userId: claimedRun.requested_by, model: input.data.model });
    await failRun(supabase, claimedRun.id, error);
  }

  return new Response(null, { status: 202 });
}