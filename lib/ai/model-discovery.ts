import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { fallbackAiModels, type AiCapability } from "@/lib/ai/model-catalog";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const modelDiscoveryCacheMs = 5 * 60 * 1000;
const modelDiscoveryTimeoutMs = 3000;

export const aiModelSorts = ["most-popular", "pricing-low-to-high", "pricing-high-to-low"] as const;
export type AiModelSort = (typeof aiModelSorts)[number];

const providerModelSchema = z.object({
  id: z.string().min(1),
  canonical_slug: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  created: z.number().optional(),
  context_length: z.number().optional(),
  architecture: z.object({
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
  }).optional(),
  supported_parameters: z.unknown().optional(),
  pricing: z.unknown().optional(),
});

const providerModelsResponseSchema = z.object({ data: z.array(providerModelSchema) });

type ProviderModel = z.infer<typeof providerModelSchema>;

type CachedDiscovery = {
  expiresAt: number;
  models: ProviderModel[];
};

export type AiModelCatalogEntry = {
  id: string;
  label: string;
  capability: AiCapability;
  description: string;
  available: boolean;
  compatible: boolean;
  providerName: string | null;
  providerDescription: string | null;
  pricing: Record<string, string> | null;
  contextLength: number | null;
  created: number | null;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  source: "live" | "stale" | "local";
  reason?: string;
};

export type AiModelCatalogSnapshot = {
  status: "live" | "stale" | "unavailable";
  models: AiModelCatalogEntry[];
};

const discoveryCache = new Map<string, CachedDiscovery>();

function providerHasImageOutput(model: ProviderModel) {
  if (model.architecture?.output_modalities?.includes("image")) return true;
  return /(?:^|[-/ ])image(?:$|[-/ ])/i.test(`${model.id} ${model.name ?? ""}`);
}

function providerSupportsCapability(model: ProviderModel, capability: AiCapability) {
  if (capability === "image") return providerHasImageOutput(model);
  if (providerHasImageOutput(model)) return false;

  const parameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.filter((parameter): parameter is string => typeof parameter === "string")
    : model.supported_parameters && typeof model.supported_parameters === "object"
      ? Object.keys(model.supported_parameters)
      : [];

  return parameters.includes("structured_outputs") || parameters.includes("response_format");
}

function normalizePricing(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length ? Object.fromEntries(entries) : null;
}

function normalizeParameters(value: unknown) {
  if (Array.isArray(value)) return value.filter((parameter): parameter is string => typeof parameter === "string");
  if (value && typeof value === "object") return Object.keys(value);
  return [];
}

async function fetchDiscovery(capability: AiCapability, sort: AiModelSort) {
  const env = getServerEnv();

  if (!env.OPENROUTER_API_KEY) throw new Error("OpenRouter is not configured.");

  const query = new URLSearchParams(capability === "image" ? { sort } : { output_modalities: "text", sort });
  const endpoint = capability === "image"
    ? `${openRouterBaseUrl}/images/models?${query.toString()}`
    : `${openRouterBaseUrl}/models?${query.toString()}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` };
  if (env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  if (env.OPENROUTER_APP_NAME) headers["X-Title"] = env.OPENROUTER_APP_NAME;

  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(modelDiscoveryTimeoutMs) });
  if (!response.ok) throw new Error("OpenRouter model discovery failed.");

  const payload = providerModelsResponseSchema.safeParse(await response.json());
  if (!payload.success) throw new Error("OpenRouter returned an invalid model catalog.");

  const models = payload.data.data.filter((model) => providerSupportsCapability(model, capability));
  const cacheEntry = { expiresAt: Date.now() + modelDiscoveryCacheMs, models };
  discoveryCache.set(`${capability}:${sort}`, cacheEntry);
  return cacheEntry;
}

function toCatalogEntry(capability: AiCapability, providerModel: ProviderModel, source: AiModelCatalogEntry["source"]): AiModelCatalogEntry {
  const providerName = providerModel.id.split("/", 1)[0] ?? null;

  return {
    id: providerModel.id,
    label: providerModel.name ?? providerModel.id,
    capability,
    description: providerModel.description ?? "OpenRouter model available for Star Board generation.",
    available: source !== "local",
    compatible: true,
    providerName,
    providerDescription: providerModel.description ?? null,
    pricing: normalizePricing(providerModel.pricing),
    contextLength: providerModel.context_length ?? null,
    created: providerModel.created ?? null,
    inputModalities: providerModel.architecture?.input_modalities ?? [],
    outputModalities: providerModel.architecture?.output_modalities ?? [],
    supportedParameters: normalizeParameters(providerModel.supported_parameters),
    source,
  };
}

function fallbackCatalog(capability: AiCapability): AiModelCatalogEntry[] {
  return fallbackAiModels.filter((model) => model.capability === capability).map((model) => ({
    ...model,
    capability,
    available: false,
    compatible: true,
    providerName: model.id.split("/", 1)[0] ?? null,
    providerDescription: model.description,
    pricing: null,
    contextLength: null,
    created: null,
    inputModalities: ["text"],
    outputModalities: [capability === "image" ? "image" : "text"],
    supportedParameters: capability === "structured-text" ? ["structured_outputs"] : [],
    source: "local",
    reason: "OpenRouter model discovery is unavailable; showing the offline fallback catalog.",
  }));
}

export async function getAiModelCatalog(capability: AiCapability, sort: AiModelSort = "most-popular"): Promise<AiModelCatalogSnapshot> {
  const cacheKey = `${capability}:${sort}`;
  const cached = discoveryCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return { status: "live", models: cached.models.map((model) => toCatalogEntry(capability, model, "live")) };
  }

  try {
    const discovered = await fetchDiscovery(capability, sort);
    return { status: "live", models: discovered.models.map((model) => toCatalogEntry(capability, model, "live")) };
  } catch {
    if (cached) return { status: "stale", models: cached.models.map((model) => toCatalogEntry(capability, model, "stale")) };
    return { status: "unavailable", models: fallbackCatalog(capability) };
  }
}

export function resetAiModelDiscoveryCache() {
  discoveryCache.clear();
}