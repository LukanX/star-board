import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { StudioError, studioTables } from "@/lib/ai/studio-context";
import { validateCampaignArtPath } from "@/lib/storage/campaign-art";
import { hasImageSignature } from "@/lib/ai/visual-style-references";
import type { StudioImageReference } from "@/lib/validation/studio";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const endpointSchema = z.object({
  endpoints: z.array(z.object({
    provider_tag: z.string().nullable().optional(),
    supported_parameters: z.record(z.string(), z.unknown()).default({}),
  })).max(100),
});

async function loadImageModelEndpoints(apiKey: string, model: string) {
  const endpoint = `${openRouterBaseUrl}/images/models/${model.split("/").map(encodeURIComponent).join("/")}/endpoints`;
  const unavailableMessage = "Image reference endpoint capabilities could not be verified. Try again or explicitly turn off references.";
  const invalidMessage = "The provider returned invalid reference capabilities.";
  let response: Response;
  try {
    response = await fetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new StudioError(unavailableMessage, 503);
  }
  if (!response.ok) throw new StudioError(unavailableMessage, 503);
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new StudioError(invalidMessage, 502);
  }
  const payload = endpointSchema.safeParse(responseBody);
  if (!payload.success) throw new StudioError(invalidMessage, 502);
  return payload.data.endpoints;
}

export async function resolveReferenceProviders(apiKey: string, model: string, count: number) {
  const endpoints = await loadImageModelEndpoints(apiKey, model);
  const providers = endpoints.filter((endpoint) => {
    const descriptor = endpoint.supported_parameters.input_references;
    if (!descriptor || !endpoint.provider_tag) return false;
    const limit = z.object({ max: z.number().optional() }).safeParse(descriptor);
    return !limit.success || limit.data.max === undefined || count <= limit.data.max;
  }).map((endpoint) => endpoint.provider_tag!);
  if (!providers.length) throw new StudioError("This model has no verified endpoint supporting the selected image references. Choose another model or explicitly turn off references.");
  return [...new Set(providers)].slice(0, 30);
}

export async function loadStudioReferenceImages(supabase: SupabaseClient, campaignId: string, references: readonly StudioImageReference[]) {
  if (references.length > 7) throw new StudioError("Choose no more than seven visual references.");
  const result: { dataUrl: string }[] = [];
  let total = 0;
  for (const reference of references) {
    const key = `${reference.kind}:${reference.id}`;
    if (!validateCampaignArtPath(campaignId, reference.path)) throw new StudioError("A reference image is outside this campaign.", 400, key);
    const { data: record, error } = await supabase.from(studioTables[reference.kind]).select("art_path,updated_at")
      .eq("campaign_id", campaignId).eq("id", reference.id).maybeSingle();
    if (error) throw new StudioError("Reference identity could not be verified.", 503, key);
    if (!record || record.art_path !== reference.path || record.updated_at !== reference.updatedAt)
      throw new StudioError("A visual reference changed or was removed. Review your subjects before generating again.", 409, key);
    const { data, error: downloadError } = await supabase.storage.from("campaign-art").download(reference.path);
    if (downloadError || !data) throw new StudioError("A selected reference image could not be read. Retry verification or use text instead.", 503, key);
    if (!["image/png", "image/jpeg", "image/webp"].includes(data.type) || data.size <= 0 || data.size > 5 * 1024 * 1024)
      throw new StudioError("Reference images must be PNG, JPEG or WebP and at most 5 MB.", 400, key);
    total += data.size;
    if (total > 20 * 1024 * 1024) throw new StudioError("Reference images must total no more than 20 MB. Select fewer references.", 400, key);
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!hasImageSignature(bytes, data.type)) throw new StudioError("A reference image has invalid image data.", 400, key);
    result.push({ dataUrl: `data:${data.type};base64,${Buffer.from(bytes).toString("base64")}` });
  }
  return result;
}
