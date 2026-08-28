import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

import { getAiModelCatalog, resetAiModelDiscoveryCache } from "@/lib/ai/model-discovery";

describe("OpenRouter model discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAiModelDiscoveryCache();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("returns live structured-output models and sends capability and sort filters", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", supported_parameters: ["structured_outputs"], pricing: { prompt: "0.1" } },
      { id: "openai/gpt-5-image-mini", name: "GPT-5 Image mini", architecture: { output_modalities: ["text", "image"] }, supported_parameters: ["structured_outputs"] },
      { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", supported_parameters: ["structured_outputs"] },
      { id: "google/gemini-2.5-flash", name: "Gemini", supported_parameters: ["tools"] },
      { id: "provider/not-curated", name: "Ignore me", supported_parameters: ["structured_outputs"] },
    ] }), { status: 200 }));

    const result = await getAiModelCatalog("structured-text");
    const gpt = result.models.find((model) => model.id === "openai/gpt-4o-mini");
    const externalModel = result.models.find((model) => model.id === "provider/not-curated");

    expect(result.status).toBe("live");
    expect(result.models).toHaveLength(2);
    expect(gpt).toMatchObject({ available: true, compatible: true, pricing: { prompt: "0.1" } });
    expect(externalModel).toMatchObject({ id: "provider/not-curated", label: "Ignore me", capability: "structured-text" });
    expect(result.models.some((model) => model.id === "openai/gpt-5-image-mini")).toBe(false);
    expect(result.models.some((model) => model.id === "google/gemini-2.5-flash-image")).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular", expect.anything());
  });

  it("keeps GPT and Gemini image generators in the image catalog", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "openai/gpt-5-image-mini", name: "GPT-5 Image mini", architecture: { output_modalities: ["text", "image"] }, supported_parameters: ["structured_outputs"] },
      { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", architecture: { output_modalities: ["image"] } },
    ] }), { status: 200 }));

    const result = await getAiModelCatalog("image");

    expect(result.models.map((model) => model.id)).toEqual(["openai/gpt-5-image-mini", "google/gemini-2.5-flash-image"]);
    expect(mocks.fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/images/models?sort=most-popular", expect.anything());
  });

  it("returns a usable offline fallback list when discovery is unavailable", async () => {
    mocks.fetch.mockResolvedValue(new Response("provider unavailable", { status: 503 }));

    const result = await getAiModelCatalog("image");

    expect(result.status).toBe("unavailable");
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every((model) => model.available === false && model.compatible === true)).toBe(true);
    expect(result.models.map((model) => model.id)).toEqual(expect.arrayContaining([
      "bytedance-seed/seedream-5-0-lite",
      "bytedance-seed/seedream-5-0-pro",
    ]));
  });
});