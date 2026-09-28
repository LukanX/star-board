import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

import { getAiImagePricing, resetAiImagePricingCache } from "@/lib/ai/image-pricing";

describe("OpenRouter image endpoint pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAiImagePricingCache();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_SITE_URL: "https://star-board.example", OPENROUTER_APP_NAME: "Star Board" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("preserves provider, billable unit, and tier variants from endpoint pricing", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ endpoints: [
      { provider_name: "Seed", provider_slug: "seed", pricing: [
        { billable: "output_image", unit: "image", cost_usd: 0.045, variant: "1k" },
        { billable: "output_image", unit: "image", cost_usd: 0.06, variant: "2k" },
      ] },
      { provider_name: "Google AI Studio", provider_slug: "google-ai-studio", pricing: [
        { billable: "output_image", unit: "token", cost_usd: 0.00003 },
        { billable: "output_image", unit: "image", cost_usd: "unknown" },
      ] },
    ] }), { status: 200 }));

    const result = await getAiImagePricing("campaign-key", "bytedance-seed/seedream-5-0-pro");

    expect(result).toEqual({
      status: "live",
      prices: [
        { providerName: "Seed", providerSlug: "seed", billable: "output_image", unit: "image", costUsd: 0.045, variant: "1k" },
        { providerName: "Seed", providerSlug: "seed", billable: "output_image", unit: "image", costUsd: 0.06, variant: "2k" },
        { providerName: "Google AI Studio", providerSlug: "google-ai-studio", billable: "output_image", unit: "token", costUsd: 0.00003, variant: null },
      ],
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-pro/endpoints",
      expect.objectContaining({ headers: { Authorization: "Bearer campaign-key", "HTTP-Referer": "https://star-board.example", "X-Title": "Star Board" } }),
    );
  });

  it("caches by campaign credential and model, and rejects unsafe IDs without a request", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ endpoints: [] }), { status: 200 }));

    await getAiImagePricing("campaign-key-one", "openai/gpt-image-1");
    await getAiImagePricing("campaign-key-one", "openai/gpt-image-1");
    await getAiImagePricing("campaign-key-two", "openai/gpt-image-1");
    const unsafe = await getAiImagePricing("campaign-key-one", "https://attacker.test/image");

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(unsafe).toEqual({ status: "unavailable", prices: [] });
  });

  it("returns an unavailable empty snapshot when OpenRouter pricing is unreachable", async () => {
    mocks.fetch.mockResolvedValue(new Response("provider unavailable", { status: 503 }));

    await expect(getAiImagePricing("campaign-key", "x-ai/grok-imagine-image-2.0")).resolves.toEqual({ status: "unavailable", prices: [] });
  });

  it("keeps the last verified prices when a refresh fails", async () => {
    vi.useFakeTimers();
    try {
      const response = JSON.stringify({ endpoints: [{
        provider_name: "OpenAI",
        provider_slug: "openai",
        pricing: [{ billable: "output_image", unit: "image", cost_usd: 0.03 }],
      }] });
      mocks.fetch
        .mockResolvedValueOnce(new Response(response, { status: 200 }))
        .mockResolvedValueOnce(new Response("provider unavailable", { status: 503 }));

      await getAiImagePricing("campaign-key", "openai/gpt-image-1");
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await expect(getAiImagePricing("campaign-key", "openai/gpt-image-1")).resolves.toEqual({
        status: "stale",
        prices: [{ providerName: "OpenAI", providerSlug: "openai", billable: "output_image", unit: "image", costUsd: 0.03, variant: null }],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});