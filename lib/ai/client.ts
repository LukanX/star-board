import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z, type ZodType } from "zod";
import { getServerEnv } from "@/lib/env";
import { AiProviderError, extractProviderGenerationId, extractProviderMessage, normalizeProviderError, serializeProviderBody } from "@/lib/ai/errors";
import { defaultImageAspectRatio, defaultImageSize, type ImageAspectRatio, type ImageSize } from "@/lib/ai/image-options";

export { AiProviderError } from "@/lib/ai/errors";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";

export function getOpenRouterClient() {
  const env = getServerEnv();

  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OpenRouter is not configured. Add OPENROUTER_API_KEY to the server environment.");
  }

  const defaultHeaders: Record<string, string> = {};
  if (env.OPENROUTER_SITE_URL) defaultHeaders["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  if (env.OPENROUTER_APP_NAME) defaultHeaders["X-Title"] = env.OPENROUTER_APP_NAME;

  return {
    client: new OpenAI({ apiKey: env.OPENROUTER_API_KEY, baseURL: openRouterBaseUrl, defaultHeaders }),
    model: env.OPENROUTER_TEXT_MODEL,
  };
}

export type JsonGenerationResult = {
  data: unknown;
  model: string;
  generationId: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
  };
};

export async function generateJson(prompt: string, schema?: ZodType, requestedModel?: string): Promise<JsonGenerationResult> {
  const { client, model } = getOpenRouterClient();
  let completion;

  try {
    completion = await client.chat.completions.create({
      model: requestedModel ?? model,
      messages: [{ role: "user", content: prompt }],
      response_format: schema ? zodResponseFormat(schema, "star_board_draft") : { type: "json_object" },
    });
  } catch (error: unknown) {
    throw normalizeProviderError(error, "OpenRouter text generation failed.");
  }

  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error("The AI provider returned an empty draft.");
  }

  const usage = completion.usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;

  return {
    data: JSON.parse(content) as unknown,
    model: completion.model,
    generationId: completion.id,
    usage: usage ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, cost: usage.cost } : undefined,
  };
}

const imageGenerationResponseSchema = z.object({
  id: z.string().min(1).optional(),
  data: z.array(z.object({
    b64_json: z.string().min(1).nullable().optional(),
    url: z.string().url().nullable().optional(),
    media_type: z.string().regex(/^image\//).optional(),
  })).min(1),
  model: z.string().min(1).optional(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
    cost: z.number().nonnegative().optional(),
  }).optional(),
});

export type ImageGenerationResult = {
  image: {
    base64: string | null;
    url: string | null;
    mediaType: string;
  };
  model: string;
  generationId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
  };
};

export type ImageGenerationOptions = {
  aspectRatio?: ImageAspectRatio;
  size?: ImageSize;
};

export async function generateImage(prompt: string, requestedModel: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  const env = getServerEnv();

  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OpenRouter is not configured. Add OPENROUTER_API_KEY to the server environment.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  if (env.OPENROUTER_APP_NAME) headers["X-Title"] = env.OPENROUTER_APP_NAME;

  const response = await fetch(`${openRouterBaseUrl}/images`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: requestedModel,
      prompt,
      aspect_ratio: options.aspectRatio ?? defaultImageAspectRatio,
      size: options.size ?? defaultImageSize,
      output_format: "png",
    }),
  });

  if (!response.ok) {
    let providerMessage: string | null = null;
    let providerBody: string | null = null;
    let providerPayload: unknown = null;
    try {
      providerPayload = await response.clone().json();
      providerMessage = extractProviderMessage(providerPayload);
      providerBody = serializeProviderBody(providerPayload);
    } catch {
      const body = await response.clone().text();
      providerMessage = extractProviderMessage(body);
      providerBody = serializeProviderBody(body);
    }

    throw new AiProviderError(providerMessage ? `OpenRouter image generation failed. ${providerMessage}` : "OpenRouter image generation failed.", {
      status: response.status,
      requestId: response.headers.get("x-request-id") ?? response.headers.get("x-openrouter-request-id"),
      retryAfter: response.headers.get("retry-after"),
      providerBody,
      generationId: extractProviderGenerationId(providerPayload),
    });
  }

  const payload = imageGenerationResponseSchema.safeParse(await response.json());

  if (!payload.success) throw new Error("OpenRouter returned an invalid image response.");

  const image = payload.data.data[0];

  if (!image.b64_json && !image.url) throw new Error("The AI provider returned no image data.");

  return {
    image: {
      base64: image.b64_json ?? null,
      url: image.url ?? null,
      mediaType: image.media_type ?? "image/png",
    },
    model: payload.data.model ?? requestedModel,
    generationId: payload.data.id,
    usage: payload.data.usage ? {
      inputTokens: payload.data.usage.prompt_tokens,
      outputTokens: payload.data.usage.completion_tokens,
      cost: payload.data.usage.cost,
    } : undefined,
  };
}
