import { describe, expect, it } from "vitest";
import { formatAiImagePricing, formatAiModelPricing } from "@/lib/ai/model-pricing";

describe("AI model pricing display", () => {
  it("shows token input and output costs for text models", () => {
    expect(formatAiModelPricing("structured-text", { prompt: "0.0000015", completion: "0.000004" })).toBe("INPUT $1.50/M  //  OUTPUT $4.00/M");
  });

  it("prioritizes image output cost and includes token costs when provided", () => {
    expect(formatAiModelPricing("image", { image: "0.04", prompt: "0.000001", completion: "0.000002" })).toBe("IMAGE $0.0400/IMAGE  //  INPUT $1.00/M  //  OUTPUT $2.00/M");
  });

  it("reports unavailable pricing when the catalog has no usable cost fields", () => {
    expect(formatAiModelPricing("image", { request: "0" })).toBe("PRICING UNAVAILABLE");
  });

  it("shows endpoint prices with their actual providers, units, and resolution variants", () => {
    expect(formatAiImagePricing([
      { providerName: "Seed", providerSlug: "seed", billable: "output_image", unit: "image", costUsd: 0.045, variant: "1k" },
      { providerName: "Google AI Studio", providerSlug: "google-ai-studio", billable: "output_image", unit: "token", costUsd: 0.00003, variant: null },
      { providerName: "Recraft", providerSlug: "recraft", billable: "output_image", unit: "megapixel", costUsd: 0.05, variant: null },
    ])).toBe("Seed OUTPUT IMAGE $0.0450/IMAGE (1K)  //  Google AI Studio OUTPUT IMAGE $30.00/M TOKENS  //  Recraft OUTPUT IMAGE $0.0500/MEGAPIXEL");
  });
});