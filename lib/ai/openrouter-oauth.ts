import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hashCredential } from "@/lib/ai/credential-crypto";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const openRouterAuthorizationUrl = "https://openrouter.ai/auth";
const oauthStateLifetimeSeconds = 10 * 60;
const oauthRequestTimeoutMs = 15_000;

export const openRouterOAuthStateCookieName = "star-board-openrouter-oauth";
export const openRouterOAuthStateLifetime = oauthStateLifetimeSeconds;

export type OpenRouterOAuthState = {
  campaignId: string;
  userId: string;
  state: string;
  codeVerifier: string;
  expiresAt: number;
};

export type OpenRouterKeyMetadata = {
  label: string;
  limitUsd: number | null;
  remainingUsd: number | null;
  usageUsd: number;
  unlimited: boolean;
};

export class OpenRouterOAuthError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "OpenRouterOAuthError";
    this.status = status;
  }
}

function base64UrlJson(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function parseBase64UrlJson(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new OpenRouterOAuthError("The OpenRouter connection could not be verified.");
  }
}

function signStatePayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function verifySignature(received: string, expected: string) {
  const receivedBytes = Buffer.from(received, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

function stateInputSchema() {
  return z.object({
    campaignId: z.string().uuid(),
    userId: z.string().uuid(),
    state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
    codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    expiresAt: z.number().int().positive(),
  });
}

export function createOpenRouterOAuthState(campaignId: string, userId: string, secret: string, now = Date.now()): OpenRouterOAuthState & { cookieValue: string; codeChallenge: string } {
  const state: OpenRouterOAuthState = {
    campaignId,
    userId,
    state: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(32).toString("base64url"),
    expiresAt: now + oauthStateLifetimeSeconds * 1000,
  };
  const payload = base64UrlJson(JSON.stringify(state));
  const signature = signStatePayload(payload, secret);

  return {
    ...state,
    cookieValue: `${payload}.${signature}`,
    codeChallenge: createHash("sha256").update(state.codeVerifier, "utf8").digest("base64url"),
  };
}

export function verifyOpenRouterOAuthState(cookieValue: string | undefined, secret: string, now = Date.now()): OpenRouterOAuthState {
  if (!cookieValue) throw new OpenRouterOAuthError("The OpenRouter connection expired. Start again.");

  const [payload, signature, extra] = cookieValue.split(".");
  if (!payload || !signature || extra || !verifySignature(signature, signStatePayload(payload, secret))) {
    throw new OpenRouterOAuthError("The OpenRouter connection could not be verified.");
  }

  const parsed = stateInputSchema().safeParse(parseBase64UrlJson(payload));
  if (!parsed.success || parsed.data.expiresAt <= now) {
    throw new OpenRouterOAuthError("The OpenRouter connection expired. Start again.");
  }

  return parsed.data;
}

export function buildOpenRouterAuthorizationUrl(input: { callbackUrl: string; codeChallenge: string; keyLabel?: string }) {
  const url = new URL(openRouterAuthorizationUrl);
  url.searchParams.set("callback_url", input.callbackUrl);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.keyLabel?.trim()) url.searchParams.set("key_label", input.keyLabel.trim().slice(0, 200));
  return url.toString();
}

function numericMetadata(nullable = false) {
  const schema = z.preprocess((value) => typeof value === "string" && value.trim() ? Number(value) : value, z.number().finite().nonnegative());
  return nullable ? schema.nullable().optional() : schema.optional();
}

const keyMetadataResponseSchema = z.object({
  data: z.object({
    label: z.string().trim().min(1).max(200).optional(),
    limit: numericMetadata(true),
    limit_remaining: numericMetadata(true),
    usage: numericMetadata(),
  }),
});

const exchangeResponseSchema = z.object({ key: z.string().trim().min(1).max(512) });

async function providerRequest(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(oauthRequestTimeoutMs) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new OpenRouterOAuthError("OpenRouter did not respond in time.", 504);
    }
    throw new OpenRouterOAuthError("OpenRouter could not be reached.", 503);
  }
}

export async function exchangeOpenRouterCode(code: string, codeVerifier: string) {
  if (!code.trim() || code.length > 2000 || !codeVerifier.trim()) {
    throw new OpenRouterOAuthError("The OpenRouter authorization response is invalid.", 400);
  }

  const response = await providerRequest(`${openRouterBaseUrl}/auth/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: "S256" }),
  });

  if (!response.ok) {
    throw new OpenRouterOAuthError(response.status === 403 ? "OpenRouter rejected the authorization code. Start the connection again." : "OpenRouter could not create the campaign key.", response.status);
  }

  const payload = exchangeResponseSchema.safeParse(await response.json());
  if (!payload.success) throw new OpenRouterOAuthError("OpenRouter returned an invalid campaign key response.", 502);
  return payload.data.key;
}

export async function getOpenRouterKeyMetadata(apiKey: string): Promise<OpenRouterKeyMetadata> {
  if (!apiKey.trim() || apiKey.length > 512) throw new OpenRouterOAuthError("The campaign OpenRouter key is invalid.", 400);

  const response = await providerRequest(`${openRouterBaseUrl}/key`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new OpenRouterOAuthError(response.status === 401 ? "The campaign OpenRouter key was rejected." : "OpenRouter key details could not be loaded.", response.status);
  }

  const payload = keyMetadataResponseSchema.safeParse(await response.json());
  if (!payload.success) throw new OpenRouterOAuthError("OpenRouter returned invalid campaign key details.", 502);

  const data = payload.data.data;
  return {
    label: data.label ?? "OpenRouter campaign key",
    limitUsd: data.limit ?? null,
    remainingUsd: data.limit_remaining ?? null,
    usageUsd: data.usage ?? 0,
    unlimited: data.limit === null || data.limit === undefined,
  };
}

export function getOpenRouterKeySettingsUrl(apiKey: string) {
  return getOpenRouterKeySettingsUrlFromHash(hashCredential(apiKey));
}

export function getOpenRouterKeySettingsUrlFromHash(keyHash: string) {
  return `https://openrouter.ai/keys/${keyHash}`;
}

export function getOpenRouterKeyLogsUrl(apiKey: string) {
  return `https://openrouter.ai/logs?api_key_hash=${hashCredential(apiKey)}`;
}