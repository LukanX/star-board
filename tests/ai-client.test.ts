import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetch: vi.fn(),
  options: undefined as unknown,
  getServerEnv: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = { completions: { create: mocks.create } };

    constructor(options: unknown) {
      mocks.options = options;
    }
  },
}));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

import { AiProviderError, generateImage, generateJson } from "@/lib/ai/client";

describe("OpenRouter AI client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini", OPENROUTER_SITE_URL: "https://star-board.example", OPENROUTER_APP_NAME: "Star Board" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("uses OpenRouter with strict JSON schema output and the requested model", async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: '{"title":"The Relay"}' } }], model: "google/gemini-2.5-flash", id: "text-run", usage: { prompt_tokens: 10, completion_tokens: 20 } });

    const result = await generateJson("mission prompt", z.object({ title: z.string() }), "google/gemini-2.5-flash");
    const request = mocks.create.mock.calls[0][0] as { model: string; response_format: { type: string; json_schema?: { strict?: boolean } } };

    expect(mocks.options).toMatchObject({ apiKey: "test-key", baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "HTTP-Referer": "https://star-board.example", "X-Title": "Star Board" } });
    expect(request.model).toBe("google/gemini-2.5-flash");
    expect(request.response_format.type).toBe("json_schema");
    expect(request.response_format.json_schema?.strict).toBe(true);
    expect(result).toMatchObject({ data: { title: "The Relay" }, model: "google/gemini-2.5-flash", generationId: "text-run", usage: { inputTokens: 10, outputTokens: 20 } });
  });

  it("normalizes OpenRouter image bytes, media type, usage, and request ID", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "image-run", model: "openai/gpt-image-1", data: [{ b64_json: "aW1hZ2U=", media_type: "image/webp" }], usage: { prompt_tokens: 4, completion_tokens: 8, cost: 0.02 } }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateImage("a station broker", "openai/gpt-image-1");
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as { model: string; prompt: string; aspect_ratio: string; size: string; output_format: string };

    expect(mocks.fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/images", expect.objectContaining({ method: "POST" }));
    expect(request).toEqual({ model: "openai/gpt-image-1", prompt: "a station broker", aspect_ratio: "1:1", size: "1024x1024", output_format: "png" });
    expect(result).toMatchObject({ generationId: "image-run", model: "openai/gpt-image-1", image: { base64: "aW1hZ2U=", mediaType: "image/webp" }, usage: { inputTokens: 4, outputTokens: 8, cost: 0.02 } });
  });

  it("forwards a requested aspect ratio and pixel size", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ model: "openai/gpt-image-1", data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }] }), { status: 200 }));

    await generateImage("a wide station", "openai/gpt-image-1", { aspectRatio: "16:9", size: "3840x2160" });
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as { aspect_ratio: string; size: string };

    expect(request).toMatchObject({ aspect_ratio: "16:9", size: "3840x2160" });
  });

  it("preserves image provider status and retry metadata", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Provider rate limit exceeded" } }), { status: 429, headers: { "x-request-id": "image-request-1", "retry-after": "12" } }));

    const failure = generateImage("a station broker", "openai/gpt-image-1");

    await expect(failure).rejects.toBeInstanceOf(AiProviderError);
    await expect(failure).rejects.toMatchObject({ status: 429, requestId: "image-request-1", retryAfter: "12", message: expect.stringContaining("Provider rate limit exceeded") });
  });

  it("returns an actionable timeout error when image generation takes too long", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockRejectedValue(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }));

    const failure = generateImage("a station broker", "openai/gpt-image-1");

    await expect(failure).rejects.toMatchObject({ status: 504, message: expect.stringContaining("timed out") });
  });

  it("keeps bounded provider bodies and generation IDs for diagnostics", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_API_KEY: "test-key", OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response("upstream gateway failure", { status: 502, headers: { "x-openrouter-request-id": "image-request-2" } }));

    const failure = generateImage("a station broker", "openai/gpt-image-1");

    await expect(failure).rejects.toMatchObject({
      status: 502,
      requestId: "image-request-2",
      providerBody: "upstream gateway failure",
      generationId: null,
    });
  });

  it("preserves text provider status and retry metadata", async () => {
    mocks.create.mockRejectedValue({ status: 429, request_id: "text-request-1", headers: new Headers({ "retry-after": "9" }), error: { message: "Too many requests", request_id: "text-request-body", prompt: "do not log this" }, id: "text-generation-1" });

    const failure = generateJson("mission prompt", z.object({ title: z.string() }), "google/gemini-2.5-flash");

    await expect(failure).rejects.toBeInstanceOf(AiProviderError);
    await expect(failure).rejects.toMatchObject({ status: 429, requestId: "text-request-1", retryAfter: "9", generationId: "text-generation-1", providerBody: expect.stringContaining("Too many requests"), message: expect.stringContaining("Too many requests") });
    await expect(failure).rejects.not.toMatchObject({ providerBody: expect.stringContaining("do not log this") });
  });
});