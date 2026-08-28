import { parseAonCreatureUrl, type AonCreatureUrl } from "@/lib/enemies/aon-url";

export const DEFAULT_AON_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_AON_MAX_BYTES = 1_500_000;
export const DEFAULT_AON_MAX_REDIRECTS = 2;

export type AonFetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
};

export type AonCreatureFetchResult = {
  html: string;
  url: AonCreatureUrl;
  status: number;
  contentType: string;
  bytes: number;
};

export class AonFetchError extends Error {
  readonly code:
    | "INVALID_URL"
    | "TIMEOUT"
    | "REDIRECT"
    | "HTTP_STATUS"
    | "CONTENT_TYPE"
    | "RESPONSE_TOO_LARGE"
    | "BODY_READ";

  constructor(code: AonFetchError["code"], message: string) {
    super(message);
    this.name = "AonFetchError";
    this.code = code;
  }
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function getHeader(response: Response, name: string): string {
  return response.headers.get(name) ?? "";
}

async function readBodyWithinLimit(response: Response, maxBytes: number): Promise<{ bytes: number; text: string }> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new AonFetchError("RESPONSE_TOO_LARGE", "The Archives of Nethys response exceeds the allowed size.");
    }
    return { bytes: buffer.byteLength, text: new TextDecoder().decode(buffer) };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new AonFetchError("RESPONSE_TOO_LARGE", "The Archives of Nethys response exceeds the allowed size.");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof AonFetchError) throw error;
    throw new AonFetchError("BODY_READ", "The Archives of Nethys response could not be read.");
  }

  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, text: new TextDecoder().decode(buffer) };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "text/html, application/xhtml+xml",
        "user-agent": userAgent,
      },
    });
  } catch {
    if (controller.signal.aborted) {
      throw new AonFetchError("TIMEOUT", "The Archives of Nethys request timed out.");
    }
    throw new AonFetchError("BODY_READ", "The Archives of Nethys request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAonCreatureHtml(
  input: string | AonCreatureUrl,
  options: AonFetchOptions = {},
): Promise<AonCreatureFetchResult> {
  let current: AonCreatureUrl;
  try {
    current = typeof input === "string" ? parseAonCreatureUrl(input) : parseAonCreatureUrl(input.canonicalUrl);
  } catch (error) {
    if (error instanceof Error) {
      throw new AonFetchError("INVALID_URL", error.message);
    }
    throw new AonFetchError("INVALID_URL", "The Archives of Nethys URL is not valid.");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_AON_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_AON_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_AON_MAX_REDIRECTS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxBytes) || maxBytes <= 0 || !Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new AonFetchError("BODY_READ", "Archives of Nethys fetch limits must be positive integers.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const userAgent = options.userAgent ?? "Star Board enemy importer/1.0";
  const requestedExternalId = current.externalId;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchWithTimeout(fetchImpl, current.canonicalUrl, timeoutMs, userAgent);

    if (redirectStatuses.has(response.status)) {
      const location = getHeader(response, "location");
      if (!location || redirectCount === maxRedirects) {
        throw new AonFetchError("REDIRECT", "The Archives of Nethys redirect chain is invalid or too long.");
      }
      try {
        const redirected = parseAonCreatureUrl(new URL(location, current.canonicalUrl).toString());
        if (redirected.externalId !== requestedExternalId) {
          throw new AonFetchError("REDIRECT", "The Archives of Nethys redirect identified a different creature.");
        }
        current = redirected;
      } catch (error) {
        if (error instanceof AonFetchError) throw error;
        const reason = error instanceof Error ? error.message : "The redirect is not allowed.";
        throw new AonFetchError("REDIRECT", `The Archives of Nethys redirect was rejected: ${reason}`);
      }
      continue;
    }

    if (!response.ok) {
      throw new AonFetchError("HTTP_STATUS", `Archives of Nethys returned HTTP ${response.status}.`);
    }

    const contentType = getHeader(response, "content-type").toLowerCase();
    if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
      throw new AonFetchError("CONTENT_TYPE", "The Archives of Nethys response is not HTML.");
    }

    const contentLength = Number.parseInt(getHeader(response, "content-length"), 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new AonFetchError("RESPONSE_TOO_LARGE", "The Archives of Nethys response exceeds the allowed size.");
    }

    const body = await readBodyWithinLimit(response, maxBytes);
    return {
      html: body.text,
      url: current,
      status: response.status,
      contentType,
      bytes: body.bytes,
    };
  }

  throw new AonFetchError("REDIRECT", "The Archives of Nethys redirect chain is invalid or too long.");
}
