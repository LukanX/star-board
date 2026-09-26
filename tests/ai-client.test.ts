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
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_TEXT_MODEL: "openai/gpt-4o-mini", OPENROUTER_SITE_URL: "https://star-board.example", OPENROUTER_APP_NAME: "Star Board" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("uses OpenRouter with strict JSON schema output and the requested model", async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: '{"title":"The Relay"}' } }], model: "google/gemini-2.5-flash", id: "text-run", usage: { prompt_tokens: 10, completion_tokens: 20 } });

    const result = await generateJson("test-key", "mission prompt", z.object({ title: z.string() }), "google/gemini-2.5-flash");
    const request = mocks.create.mock.calls[0][0] as { model: string; response_format: { type: string; json_schema?: { strict?: boolean } } };

    expect(mocks.options).toMatchObject({ apiKey: "test-key", baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "HTTP-Referer": "https://star-board.example", "X-Title": "Star Board" } });
    expect(request.model).toBe("google/gemini-2.5-flash");
    expect(request.response_format.type).toBe("json_schema");
    expect(request.response_format.json_schema?.strict).toBe(true);
    expect(result).toMatchObject({ data: { title: "The Relay" }, model: "google/gemini-2.5-flash", generationId: "text-run", usage: { inputTokens: 10, outputTokens: 20 } });
  });

  it.each([
    ["x-ai/grok-imagine-image-2.0", { model: "x-ai/grok-imagine-image-2.0", prompt: "a starship", aspect_ratio: "1:1", resolution: "1K" }, { resolution: "1K", supportedParameters: ["aspect_ratio", "resolution"] }],
    ["openai/gpt-image-2.5-flare", { model: "openai/gpt-image-2.5-flare", prompt: "a starship", aspect_ratio: "1:1" }, { supportedParameters: ["aspect_ratio"] }],
  ] as const)("sends only supported image parameters for %s", async (model, expectedBody, options) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ model, data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }] }), { status: 200 }));

    await generateImage("test-key", "a starship", model, options);
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as Record<string, string>;

    expect(request).toEqual(expectedBody);
  });

  it("normalizes OpenRouter image bytes, media type, usage, and request ID", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "image-run", model: "openai/gpt-image-1", data: [{ b64_json: "aW1hZ2U=", media_type: "image/webp" }], usage: { prompt_tokens: 4, completion_tokens: 8, cost: 0.02 } }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateImage("test-key", "a station broker", "openai/gpt-image-1");
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as Record<string, string>;

    expect(mocks.fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/images", expect.objectContaining({ method: "POST" }));
    expect(request).toEqual({ model: "openai/gpt-image-1", prompt: "a station broker", aspect_ratio: "1:1" });
    expect(result).toMatchObject({ generationId: "image-run", model: "openai/gpt-image-1", image: { base64: "aW1hZ2U=", mediaType: "image/webp" }, usage: { inputTokens: 4, outputTokens: 8, cost: 0.02 } });
  });

  it("does not send exact pixels when a model supports aspect ratio only", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ model: "openai/gpt-image-1", data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }] }), { status: 200 }));

    await generateImage("test-key", "a wide station", "openai/gpt-image-1", { aspectRatio: "16:9", size: "3840x2160", supportedParameters: ["aspect_ratio"] });
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as Record<string, string>;

    expect(request).toEqual({ model: "openai/gpt-image-1", prompt: "a wide station", aspect_ratio: "16:9" });
  });

  it.each([
    ["bytedance-seed/seedream-5-0-lite", "1024x1024", "2K"],
    ["bytedance-seed/seedream-5-0-lite", "2048x2048", "2K"],
    ["bytedance-seed/seedream-5-0-pro", "1024x1024", "1K"],
    ["bytedance-seed/seedream-5-0-pro", "2048x2048", "2K"],
  ] as const)("uses the supported resolution contract for Seedream %s", async (model, size, resolution) => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: model });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ model, data: [{ b64_json: "aW1hZ2U=", media_type: "image/png" }] }), { status: 200 }));

    await generateImage("test-key", "a Seedream station", model, { size });
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as Record<string, string>;

    expect(request).toEqual({ model, prompt: "a Seedream station", aspect_ratio: "1:1", resolution });
  });

  it("preserves image provider status and retry metadata", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Provider rate limit exceeded" } }), { status: 429, headers: { "x-request-id": "image-request-1", "retry-after": "12" } }));

    const failure = generateImage("test-key", "a station broker", "openai/gpt-image-1");

    await expect(failure).rejects.toBeInstanceOf(AiProviderError);
    await expect(failure).rejects.toMatchObject({ status: 429, requestId: "image-request-1", retryAfter: "12", message: expect.stringContaining("Provider rate limit exceeded") });
  });

  it("returns an actionable timeout error when image generation takes too long", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockRejectedValue(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }));

    const failure = generateImage("test-key", "a station broker", "openai/gpt-image-1");

    await expect(failure).rejects.toMatchObject({ status: 504, message: expect.stringContaining("timed out") });
  });

  it("keeps bounded provider bodies and generation IDs for diagnostics", async () => {
    mocks.getServerEnv.mockReturnValue({ OPENROUTER_IMAGE_MODEL: "openai/gpt-image-1" });
    mocks.fetch.mockResolvedValue(new Response("upstream gateway failure", { status: 502, headers: { "x-openrouter-request-id": "image-request-2" } }));

    const failure = generateImage("test-key", "a station broker", "openai/gpt-image-1");

    await expect(failure).rejects.toMatchObject({
      status: 502,
      requestId: "image-request-2",
      providerBody: "upstream gateway failure",
      generationId: null,
    });
  });

  it("surfaces sanitized schema paths when a provider returns an unexpected image response", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ model: "x-ai/grok-imagine-image-2.0", data: [{ url: "not-a-url" }] }), {
      status: 200,
      headers: { "x-request-id": "image-schema-request" },
    }));

    const failure = generateImage("test-key", "a starship", "x-ai/grok-imagine-image-2.0", {
      supportedParameters: ["aspect_ratio", "resolution"],
    });

    await expect(failure).rejects.toMatchObject({
      name: "AiProviderError",
      status: 502,
      requestId: "image-schema-request",
      message: expect.stringContaining("data.0.url"),
    });
    await expect(failure).rejects.not.toMatchObject({ providerBody: expect.any(String) });
  });

  it("preserves safe socket error codes when image fetch fails before an HTTP response", async () => {
    const socketCause = Object.assign(new Error("socket closed for 203.0.113.20:443"), {
      code: "UND_ERR_SOCKET",
      socket: { bytesWritten: 912, bytesRead: 0, timeout: 60_000, remoteAddress: "203.0.113.20", remotePort: 443 },
    });
    mocks.fetch.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: socketCause }));

    const failure = generateImage("test-key", "a station broker", "bytedance-seed/seedream-5-0-pro", {
      supportedParameters: ["aspect_ratio", "resolution"],
      resolution: "1K",
    });

    await expect(failure).rejects.toMatchObject({
      name: "AiProviderError",
      status: null,
      outcomeUnknown: true,
      message: expect.stringContaining("UND_ERR_SOCKET, sent 912 bytes, received 0 bytes"),
      providerBody: expect.stringContaining('"code":"UND_ERR_SOCKET"'),
    });
    await expect(failure).rejects.toMatchObject({
      providerBody: expect.stringContaining('"bytesWritten":912'),
    });
    await expect(failure).rejects.toMatchObject({
      providerBody: expect.not.stringContaining("203.0.113.20"),
    });
  });

  it("does not mark a socket failure before any bytes were written as potentially billed", async () => {
    mocks.fetch.mockRejectedValue(Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("socket closed"), {
        code: "UND_ERR_SOCKET",
        socket: { bytesWritten: 0, bytesRead: 0 },
      }),
    }));

    await expect(generateImage("test-key", "a station broker", "bytedance-seed/seedream-5-0-pro")).rejects.toMatchObject({
      status: null,
      outcomeUnknown: false,
    });
  });

  it("preserves text provider status and retry metadata", async () => {
    mocks.create.mockRejectedValue({ status: 429, request_id: "text-request-1", headers: new Headers({ "retry-after": "9" }), error: { message: "Too many requests", request_id: "text-request-body", prompt: "do not log this" }, id: "text-generation-1" });

    const failure = generateJson("test-key", "mission prompt", z.object({ title: z.string() }), "google/gemini-2.5-flash");

    await expect(failure).rejects.toBeInstanceOf(AiProviderError);
    await expect(failure).rejects.toMatchObject({ status: 429, requestId: "text-request-1", retryAfter: "9", generationId: "text-generation-1", providerBody: expect.stringContaining("Too many requests"), message: expect.stringContaining("Too many requests") });
    await expect(failure).rejects.not.toMatchObject({ providerBody: expect.stringContaining("do not log this") });
  });
});