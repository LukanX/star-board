import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z, type ZodType } from "zod";
import { getServerEnv } from "@/lib/env";
import { AiProviderError, extractProviderGenerationId, extractProviderMessage, normalizeProviderError, serializeProviderBody } from "@/lib/ai/errors";
import { defaultImageAspectRatio, defaultImageSize, getPreferredImageResolution, imageSizeOptions, type ImageAspectRatio, type ImageResolution, type ImageSize } from "@/lib/ai/image-options";

export { AiProviderError } from "@/lib/ai/errors";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const defaultImageGenerationTimeoutMs = 2 * 60 * 1000;

function getTransportDiagnostics(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const nestedErrors = cause && typeof cause === "object" && Array.isArray((cause as { errors?: unknown }).errors)
    ? (cause as { errors: unknown[] }).errors
    : [cause];
  const socketMetrics: Array<{ bytesWritten?: number; bytesRead?: number; timeoutMs?: number }> = [];
  const causes = nestedErrors.slice(0, 3).flatMap((nested) => {
    if (!nested || typeof nested !== "object") return [];
    const detail = nested as { name?: unknown; code?: unknown; socket?: unknown };
    if (detail.socket && typeof detail.socket === "object") {
      const socket = detail.socket as { bytesWritten?: unknown; bytesRead?: unknown; timeout?: unknown };
      const metrics = {
        ...(typeof socket.bytesWritten === "number" ? { bytesWritten: socket.bytesWritten } : {}),
        ...(typeof socket.bytesRead === "number" ? { bytesRead: socket.bytesRead } : {}),
        ...(typeof socket.timeout === "number" ? { timeoutMs: socket.timeout } : {}),
      };
      if (Object.keys(metrics).length) socketMetrics.push(metrics);
    }
    return [{
      ...(typeof detail.name === "string" ? { name: detail.name.slice(0, 80) } : {}),
      ...(typeof detail.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(detail.code) ? { code: detail.code } : {}),
    }];
  });
  const transportCode = causes.find((detail) => detail.code)?.code;
  const firstSocketMetrics = socketMetrics[0];

  return {
    ...(transportCode ? { transportCode } : {}),
    ...(firstSocketMetrics ? { socket: firstSocketMetrics } : {}),
    providerBody: serializeProviderBody({
      errorName: error instanceof Error ? error.name : "unknown",
      causes,
      ...(firstSocketMetrics ? { socket: firstSocketMetrics } : {}),
    }),
  };
}

export function getOpenRouterClient(apiKey: string) {
  const env = getServerEnv();

  const defaultHeaders: Record<string, string> = {};
  if (env.OPENROUTER_SITE_URL) defaultHeaders["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  if (env.OPENROUTER_APP_NAME) defaultHeaders["X-Title"] = env.OPENROUTER_APP_NAME;

  return {
    client: new OpenAI({ apiKey, baseURL: openRouterBaseUrl, defaultHeaders }),
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

export type JsonGenerationOptions = {
  timeoutMs?: number;
  imageReferences?: readonly JsonGenerationImageReference[];
};

export type JsonGenerationImageReference = {
  dataUrl: string;
};

function buildJsonMessageContent(prompt: string, imageReferences: readonly JsonGenerationImageReference[]) {
  if (!imageReferences.length) return prompt;

  return [
    { type: "text" as const, text: prompt },
    ...imageReferences.map((reference) => ({
      type: "image_url" as const,
      image_url: { url: reference.dataUrl },
    })),
  ];
}

export async function generateJson(apiKey: string, prompt: string, schema?: ZodType, requestedModel?: string, options: JsonGenerationOptions = {}): Promise<JsonGenerationResult> {
  const { client, model } = getOpenRouterClient(apiKey);
  let completion;

  try {
    completion = await client.chat.completions.create({
      model: requestedModel ?? model,
      messages: [{ role: "user", content: buildJsonMessageContent(prompt, options.imageReferences ?? []) }],
      response_format: schema ? zodResponseFormat(schema, "star_board_draft") : { type: "json_object" },
    }, options.timeoutMs === undefined ? undefined : { signal: AbortSignal.timeout(options.timeoutMs) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new AiProviderError("OpenRouter text generation timed out. Try again shortly.", { status: 504 });
    }

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
  resolution?: ImageResolution;
  size?: ImageSize;
  supportedParameters?: readonly string[];
  outputFormat?: "png" | "jpeg" | "webp";
  timeoutMs?: number;
};

const seedreamModelPrefix = "bytedance-seed/seedream-";
const seedreamLiteModel = "bytedance-seed/seedream-5-0-lite";
const grokImageModelPrefix = "x-ai/grok-imagine-image";

function buildImageRequestBody(requestedModel: string, prompt: string, options: ImageGenerationOptions) {
  const aspectRatio = options.aspectRatio ?? defaultImageAspectRatio;
  const size = options.size ?? defaultImageSize;
  const supportsParameter = (parameter: string) => options.supportedParameters
    ? options.supportedParameters.includes(parameter)
    : parameter === "aspect_ratio";

  if (requestedModel.startsWith(seedreamModelPrefix) || requestedModel.startsWith(grokImageModelPrefix)) {
    const tier = imageSizeOptions[aspectRatio].find((option) => option.value === size)?.tier ?? "1K";
    const defaultResolution = requestedModel === seedreamLiteModel && tier === "1K" ? "2K" : tier;
    const resolution = options.resolution ?? getPreferredImageResolution([defaultResolution]) ?? "1K";

    return { model: requestedModel, prompt, aspect_ratio: aspectRatio, resolution };
  }

  const body: Record<string, string> = { model: requestedModel, prompt };
  if (supportsParameter("aspect_ratio")) body.aspect_ratio = aspectRatio;
  if (options.resolution && supportsParameter("resolution")) body.resolution = options.resolution;
  if (options.size && supportsParameter("size")) body.size = options.size;
  if (options.outputFormat && supportsParameter("output_format")) body.output_format = options.outputFormat;

  return body;
}

export async function generateImage(apiKey: string, prompt: string, requestedModel: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  const env = getServerEnv();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  if (env.OPENROUTER_APP_NAME) headers["X-Title"] = env.OPENROUTER_APP_NAME;

  let response: Response;

  try {
    response = await fetch(`${openRouterBaseUrl}/images`, {
      method: "POST",
      headers,
      body: JSON.stringify(buildImageRequestBody(requestedModel, prompt, options)),
      signal: AbortSignal.timeout(options.timeoutMs ?? defaultImageGenerationTimeoutMs),
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new AiProviderError("OpenRouter image generation timed out. Try again, or use background generation for long-running requests.", { status: 504 });
    }

    const normalized = normalizeProviderError(error, "OpenRouter image generation request failed.");
    const diagnostics = getTransportDiagnostics(error);
    const socketDetail = diagnostics.socket
      ? `, sent ${diagnostics.socket.bytesWritten ?? "?"} bytes, received ${diagnostics.socket.bytesRead ?? "?"} bytes`
      : "";
    const transportDetail = diagnostics.transportCode ? ` (${diagnostics.transportCode}${socketDetail})` : "";
    throw new AiProviderError(`${normalized.message}${transportDetail}`, {
      status: normalized.status,
      requestId: normalized.requestId,
      retryAfter: normalized.retryAfter,
      providerBody: diagnostics.providerBody,
      generationId: normalized.generationId,
      outcomeUnknown: diagnostics.transportCode === "UND_ERR_SOCKET" && (diagnostics.socket?.bytesWritten ?? 0) > 0,
    });
  }

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

  const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-openrouter-request-id");
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new AiProviderError("OpenRouter returned an unreadable image response.", { status: 502, requestId });
  }

  const payload = imageGenerationResponseSchema.safeParse(responseBody);

  if (!payload.success) {
    const issueSummary = payload.error.issues.slice(0, 4).map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "response";
      return `${path}: ${issue.message}`;
    }).join("; ");
    throw new AiProviderError(`OpenRouter returned an invalid image response. ${issueSummary}`, { status: 502, requestId });
  }

  const image = payload.data.data[0];

  if (!image.b64_json && !image.url) {
    throw new AiProviderError("The AI provider returned no image data.", { status: 502, requestId });
  }

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
