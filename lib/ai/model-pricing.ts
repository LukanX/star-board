import type { AiCapability } from "@/lib/ai/model-catalog";
import type { AiImagePrice } from "@/lib/ai/image-pricing";

export function formatAiImagePricing(prices: readonly AiImagePrice[] | null | undefined) {
  if (!prices?.length) return "IMAGE PRICING UNAVAILABLE";

  return prices.map((price) => {
    const billable = price.billable.replace(/_/g, " ").toUpperCase();
    const unit = price.unit.toLowerCase();
    const amount = unit === "token"
      ? `$${(price.costUsd * 1_000_000).toFixed(2)}/M TOKENS`
      : unit === "image"
        ? `$${price.costUsd.toFixed(4)}/IMAGE`
        : unit === "megapixel"
          ? `$${price.costUsd.toFixed(4)}/MEGAPIXEL`
          : `$${price.costUsd.toFixed(6)}/${price.unit.toUpperCase()}`;
    const variant = price.variant ? ` (${price.variant.toUpperCase()})` : "";

    return `${price.providerName} ${billable} ${amount}${variant}`;
  }).join("  //  ");
}

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