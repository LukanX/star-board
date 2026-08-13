export class AiProviderError extends Error {
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryAfter: string | null;
  readonly providerBody: string | null;
  readonly generationId: string | null;

  constructor(message: string, options: { status?: number | null; requestId?: string | null; retryAfter?: string | null; providerBody?: string | null; generationId?: string | null } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.providerBody = options.providerBody ?? null;
    this.generationId = options.generationId ?? null;
  }
}

const providerBodyLimit = 2000;
const sensitiveProviderKey = /api[_-]?key|authorization|cookie|password|passphrase|prompt|secret|token/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function redactProviderValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return value.slice(0, providerBodyLimit);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactProviderValue(item, depth + 1));
  if (!isRecord(value)) return value;

  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, nestedValue]) => [
    key,
    sensitiveProviderKey.test(key) ? "[redacted]" : redactProviderValue(nestedValue, depth + 1),
  ]));
}

export function serializeProviderBody(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  try {
    const sanitized = redactProviderValue(value);
    const serialized = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized);
    return serialized?.slice(0, providerBodyLimit) || null;
  } catch {
    return null;
  }
}

export function extractProviderGenerationId(value: unknown): string | null {
  if (!isRecord(value)) return null;

  for (const key of ["generation_id", "generationId", "id"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }

  for (const key of ["error", "response", "data"]) {
    const generationId = extractProviderGenerationId(value[key]);
    if (generationId) return generationId;
  }

  return null;
}

export function extractProviderMessage(value: unknown): string | null {
  if (typeof value === "string") return value.trim().slice(0, 500) || null;
  if (!isRecord(value)) return null;

  for (const key of ["message", "detail", "error"]) {
    const message = extractProviderMessage(value[key]);
    if (message) return message;
  }

  return null;
}

function extractHeader(headers: unknown, name: string) {
  if (headers instanceof Headers) return headers.get(name);
  if (!isRecord(headers)) return null;
  const value = headers[name] ?? headers[name.toLowerCase()];
  return typeof value === "string" ? value : null;
}

export function normalizeProviderError(error: unknown, fallback: string) {
  if (error instanceof AiProviderError) return error;

  const details = isRecord(error) ? error : {};
  const providerPayload = details.error ?? details.body ?? details.message ?? error;
  const providerMessage = extractProviderMessage(details.error) ?? extractProviderMessage(details.message);
  const status = typeof details.status === "number" ? details.status : null;
  const requestId = typeof details.request_id === "string"
    ? details.request_id
    : typeof details.requestId === "string"
      ? details.requestId
      : typeof details.requestID === "string"
        ? details.requestID
        : extractHeader(details.headers, "x-request-id") ?? extractHeader(details.headers, "x-openrouter-request-id");
  const retryAfter = extractHeader(details.headers, "retry-after");

  return new AiProviderError(providerMessage ? `${fallback} ${providerMessage}` : fallback, {
    status,
    requestId,
    retryAfter,
    providerBody: serializeProviderBody(providerPayload),
    generationId: extractProviderGenerationId(error),
  });
}

export function getAiProviderFailure(error: unknown, fallback: string) {
  const providerError = error instanceof AiProviderError ? error : null;
  const status = providerError?.status && providerError.status >= 400 && providerError.status <= 599 ? providerError.status : 503;

  return {
    message: providerError?.message ?? fallback,
    status,
    requestId: providerError?.requestId ?? null,
    retryAfter: providerError?.retryAfter ?? null,
  };
}

export function logAiProviderFailure(error: unknown, context: { kind: string; campaignId?: string; userId?: string; model?: string }) {
  if (!(error instanceof AiProviderError)) return;

  console.error(JSON.stringify({
    event: "ai_provider_failure",
    ...context,
    status: error.status,
    requestId: error.requestId,
    generationId: error.generationId,
    retryAfter: error.retryAfter,
    providerBody: error.providerBody,
  }));
}