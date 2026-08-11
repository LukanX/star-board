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

import { generateImage, generateJson } from "@/lib/ai/client";

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
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as { model: string; prompt: string; size: string; output_format: string };

    expect(mocks.fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/images", expect.objectContaining({ method: "POST" }));
    expect(request).toEqual({ model: "openai/gpt-image-1", prompt: "a station broker", size: "1024x1024", output_format: "png" });
    expect(result).toMatchObject({ generationId: "image-run", model: "openai/gpt-image-1", image: { base64: "aW1hZ2U=", mediaType: "image/webp" }, usage: { inputTokens: 4, outputTokens: 8, cost: 0.02 } });
  });
});