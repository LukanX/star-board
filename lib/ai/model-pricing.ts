import type { AiCapability } from "@/lib/ai/model-catalog";

export function formatAiModelPricing(capability: AiCapability, pricing: Record<string, string> | null) {
  if (!pricing) return "PRICING UNAVAILABLE";

  const costs = capability === "image"
    ? [
        formatFixedCost("IMAGE", pricing.image, "/IMAGE"),
        formatPerMillion("INPUT", pricing.prompt),
        formatPerMillion("OUTPUT", pricing.completion),
      ]
    : [
        formatPerMillion("INPUT", pricing.prompt),
        formatPerMillion("OUTPUT", pricing.completion),
      ];
  const availableCosts = costs.filter((cost): cost is string => Boolean(cost));

  return availableCosts.length ? availableCosts.join("  //  ") : "PRICING UNAVAILABLE";
}

function formatPerMillion(label: string, value: string | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${label} $${(amount * 1_000_000).toFixed(2)}/M` : null;
}

function formatFixedCost(label: string, value: string | undefined, suffix: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${label} $${amount.toFixed(4)}${suffix}` : null;
}