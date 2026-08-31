import { describe, expect, it, vi } from "vitest";
import { buildOpenRouterAuthorizationUrl, createOpenRouterOAuthState, exchangeOpenRouterCode, getOpenRouterKeyMetadata, getOpenRouterKeySettingsUrl, verifyOpenRouterOAuthState } from "@/lib/ai/openrouter-oauth";

const campaignId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const secret = "server-signing-secret";

describe("OpenRouter OAuth PKCE", () => {
  it("creates and verifies a signed state with S256 material", () => {
    const pending = createOpenRouterOAuthState(campaignId, userId, secret, 1_000);
    const verified = verifyOpenRouterOAuthState(pending.cookieValue, secret, 2_000);

    expect(verified).toMatchObject({ campaignId, userId, state: pending.state, codeVerifier: pending.codeVerifier, expiresAt: 601_000 });
    expect(pending.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(() => verifyOpenRouterOAuthState(pending.cookieValue.replace(/.$/, "x"), secret, 2_000)).toThrow("could not be verified");
    expect(() => verifyOpenRouterOAuthState(pending.cookieValue, secret, 601_001)).toThrow("expired");
  });

  it("builds the documented authorization URL without a client secret", () => {
    const url = new URL(buildOpenRouterAuthorizationUrl({ callbackUrl: "https://star-board.example/api/callback?state=state-1", codeChallenge: "challenge-1", keyLabel: "Star Board" }));

    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe("https://star-board.example/api/callback?state=state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("key_label")).toBe("Star Board");
    expect(url.toString()).not.toContain("client_secret");
  });

  it("exchanges a single-use code and validates safe key metadata", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: "sk-or-v1-created" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { label: "Star Board", limit: 5, limit_remaining: 4.5, usage: 0.5 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const key = await exchangeOpenRouterCode("authorization-code", "code-verifier");
    const metadata = await getOpenRouterKeyMetadata(key);
    const exchangeBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, string>;

    expect(key).toBe("sk-or-v1-created");
    expect(exchangeBody).toEqual({ code: "authorization-code", code_verifier: "code-verifier", code_challenge_method: "S256" });
    expect(metadata).toEqual({ label: "Star Board", limitUsd: 5, remainingUsd: 4.5, usageUsd: 0.5, unlimited: false });
    expect(getOpenRouterKeySettingsUrl(key)).toMatch(/^https:\/\/openrouter\.ai\/keys\/[0-9a-f]{64}$/);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("Authorization code");
  });
});