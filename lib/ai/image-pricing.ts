import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { hashCredential } from "@/lib/ai/credential-crypto";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const imagePricingCacheMs = 5 * 60 * 1000;
const imagePricingTimeoutMs = 5000;

const endpointResponseSchema = z.object({ endpoints: z.array(z.unknown()) });
const endpointSchema = z.object({
  provider_name: z.string().optional(),
  provider_slug: z.string().optional(),
  pricing: z.array(z.unknown()).optional(),
}).passthrough();
const priceLineSchema = z.object({
  billable: z.string().min(1),
  unit: z.string().min(1),
  cost_usd: z.number().finite().nonnegative(),
  variant: z.string().optional(),
}).passthrough();

export type AiImagePrice = {
  providerName: string;
  providerSlug: string | null;
  billable: string;
  unit: string;
  costUsd: number;
  variant: string | null;
};

export type AiImagePricingSnapshot = {
  status: "live" | "stale" | "unavailable";
  prices: AiImagePrice[];
};

type CachedImagePricing = {
  expiresAt: number;
  prices: AiImagePrice[];
};

const imagePricingCache = new Map<string, CachedImagePricing>();

function isSafeImageModelId(modelId: string) {
  const parts = modelId.split("/");
  return parts.length === 2 && parts.every((part) => /^[a-z0-9][a-z0-9._-]{0,159}$/i.test(part));
}

function normalizeEndpointPricing(value: unknown): AiImagePrice[] {
  const response = endpointResponseSchema.safeParse(value);
  if (!response.success) throw new Error("OpenRouter returned an invalid image pricing catalog.");

  return response.data.endpoints.flatMap((rawEndpoint) => {
    const endpoint = endpointSchema.safeParse(rawEndpoint);
    if (!endpoint.success) return [];

    return (endpoint.data.pricing ?? []).flatMap((rawPrice) => {
      const price = priceLineSchema.safeParse(rawPrice);
      if (!price.success) return [];

      return [{
        providerName: endpoint.data.provider_name ?? endpoint.data.provider_slug ?? "OpenRouter provider",
        providerSlug: endpoint.data.provider_slug ?? null,
        billable: price.data.billable,
        unit: price.data.unit,
        costUsd: price.data.cost_usd,
        variant: price.data.variant ?? null,
      }];
    });
  });
}

export async function getAiImagePricing(apiKey: string, modelId: string): Promise<AiImagePricingSnapshot> {
  if (!isSafeImageModelId(modelId)) return { status: "unavailable", prices: [] };

  const cacheKey = `${hashCredential(apiKey)}:${modelId}`;
  const cached = imagePricingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { status: "live", prices: cached.prices };

  try {
    const env = getServerEnv();
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
    if (env.OPENROUTER_APP_NAME) headers["X-Title"] = env.OPENROUTER_APP_NAME;

    const [provider, model] = modelId.split("/");
    const response = await fetch(`${openRouterBaseUrl}/images/models/${encodeURIComponent(provider!)}/${encodeURIComponent(model!)}/endpoints`, {
      headers,
      signal: AbortSignal.timeout(imagePricingTimeoutMs),
    });
    if (!response.ok) throw new Error("OpenRouter image pricing lookup failed.");

    const prices = normalizeEndpointPricing(await response.json());
    imagePricingCache.set(cacheKey, { expiresAt: Date.now() + imagePricingCacheMs, prices });
    return { status: "live", prices };
  } catch {
    if (cached) return { status: "stale", prices: cached.prices };
    return { status: "unavailable", prices: [] };
  }
}

export function resetAiImagePricingCache() {
  imagePricingCache.clear();
}