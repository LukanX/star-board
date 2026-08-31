import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockCampaignCredentialError extends Error {
    readonly code: "missing" | "invalid" | "forbidden" | "misconfigured" | "unavailable";

    constructor(code: MockCampaignCredentialError["code"], message: string) {
      super(message);
      this.name = "CampaignCredentialError";
      this.code = code;
    }
  }

  return {
    cookies: vi.fn(),
    getAuthenticatedUser: vi.fn(),
    getCampaignCredentialForManager: vi.fn(),
    getCampaignCredentialForRefresh: vi.fn(),
    getCampaignCredentialStatusForManager: vi.fn(),
    setCampaignPlayerAi: vi.fn(),
    disconnectCampaignCredential: vi.fn(),
    saveCampaignCredential: vi.fn(),
    markCampaignCredentialInvalid: vi.fn(),
    updateCampaignCredentialMetadata: vi.fn(),
    exchangeOpenRouterCode: vi.fn(),
    getOpenRouterKeyMetadata: vi.fn(),
    getServerEnv: vi.fn(),
    CampaignCredentialError: MockCampaignCredentialError,
  };
});

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/ai/campaign-credentials", () => ({
  CampaignCredentialError: mocks.CampaignCredentialError,
  disconnectCampaignCredential: mocks.disconnectCampaignCredential,
  getCampaignCredentialForManager: mocks.getCampaignCredentialForManager,
  getCampaignCredentialForRefresh: mocks.getCampaignCredentialForRefresh,
  getCampaignCredentialStatusForManager: mocks.getCampaignCredentialStatusForManager,
  markCampaignCredentialInvalid: mocks.markCampaignCredentialInvalid,
  saveCampaignCredential: mocks.saveCampaignCredential,
  setCampaignPlayerAi: mocks.setCampaignPlayerAi,
  updateCampaignCredentialMetadata: mocks.updateCampaignCredentialMetadata,
}));
vi.mock("@/lib/ai/openrouter-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/openrouter-oauth")>();
  return {
    ...actual,
    exchangeOpenRouterCode: mocks.exchangeOpenRouterCode,
    getOpenRouterKeyMetadata: mocks.getOpenRouterKeyMetadata,
  };
});

import { GET as callback } from "@/app/api/campaigns/[campaignId]/openrouter/callback/route";
import { POST as connect } from "@/app/api/campaigns/[campaignId]/openrouter/connect/route";
import { DELETE as disconnect, GET as status, PATCH as updatePlayerAi } from "@/app/api/campaigns/[campaignId]/openrouter/route";
import { POST as refresh } from "@/app/api/campaigns/[campaignId]/openrouter/refresh/route";
import { createOpenRouterOAuthState, OpenRouterOAuthError, openRouterOAuthStateCookieName } from "@/lib/ai/openrouter-oauth";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const secret = "server-signing-secret";
const origin = "https://star-board.example";
const context = { supabase: {}, user: { id: userId } };
const credentialStatus = {
  connected: true,
  verificationStatus: "verified",
  label: "Star Board campaign key",
  limitUsd: 10,
  remainingUsd: 8,
  usageUsd: 2,
  unlimited: false,
  connectedBy: userId,
  connectedByName: "Nova",
  connectedAt: "2026-08-28T12:00:00.000Z",
  lastVerifiedAt: "2026-08-28T12:00:00.000Z",
  verificationError: null,
  allowPlayerAi: false,
  canManage: true,
  canUse: true,
  ownerSettingsUrl: "https://openrouter.ai/keys/hash",
};

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`${origin}${path}`, init);
}

function callbackRequest(query: string) {
  return request(`/api/campaigns/${campaignId}/openrouter/callback?${query}`);
}

function setOAuthCookie(value: string | undefined) {
  mocks.cookies.mockResolvedValue({
    get: vi.fn((name: string) => name === openRouterOAuthStateCookieName && value ? { value } : undefined),
  });
}

function locationUrl(response: Response) {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location as string);
}

describe("OpenRouter campaign connection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      NEXT_PUBLIC_APP_URL: origin,
      SUPABASE_SECRET_KEY: secret,
      OPENROUTER_APP_NAME: "Star Board",
    });
    mocks.getAuthenticatedUser.mockResolvedValue(context);
    mocks.getCampaignCredentialForManager.mockResolvedValue({ row: null, status: credentialStatus, manager: { isCreator: true } });
    mocks.getCampaignCredentialForRefresh.mockResolvedValue({ apiKey: "sk-or-v1-campaign", row: {}, status: credentialStatus, manager: { isCreator: true } });
    mocks.getCampaignCredentialStatusForManager.mockResolvedValue({ status: credentialStatus });
    mocks.getOpenRouterKeyMetadata.mockResolvedValue({ label: "Star Board campaign key", limitUsd: 10, remainingUsd: 8, usageUsd: 2, unlimited: false });
    mocks.exchangeOpenRouterCode.mockResolvedValue("sk-or-v1-created");
    mocks.saveCampaignCredential.mockResolvedValue(undefined);
    mocks.markCampaignCredentialInvalid.mockResolvedValue(undefined);
    mocks.updateCampaignCredentialMetadata.mockResolvedValue(undefined);
    mocks.setCampaignPlayerAi.mockResolvedValue(undefined);
    mocks.disconnectCampaignCredential.mockResolvedValue(undefined);
    setOAuthCookie(undefined);
  });

  it("rejects a cross-origin connection start", async () => {
    const response = await connect(request(`/api/campaigns/${campaignId}/openrouter/connect`, {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }), routeContext());

    expect(response.status).toBe(403);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("rejects cross-origin player access changes and disconnects", async () => {
    const headers = { origin: "https://attacker.example" };
    const playerResponse = await updatePlayerAi(request(`/api/campaigns/${campaignId}/openrouter`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ allowPlayerAi: true }),
    }), routeContext());
    const disconnectResponse = await disconnect(request(`/api/campaigns/${campaignId}/openrouter`, { method: "DELETE", headers }), routeContext());

    expect(playerResponse.status).toBe(403);
    expect(disconnectResponse.status).toBe(403);
    expect(mocks.setCampaignPlayerAi).not.toHaveBeenCalled();
    expect(mocks.disconnectCampaignCredential).not.toHaveBeenCalled();
  });

  it("starts PKCE authorization with a bound HttpOnly state cookie", async () => {
    const response = await connect(request(`/api/campaigns/${campaignId}/openrouter/connect`, {
      method: "POST",
      headers: { origin },
    }), routeContext());
    const payload = await response.json() as { authorizationUrl: string };
    const authorizationUrl = new URL(payload.authorizationUrl);
    const callbackUrl = new URL(authorizationUrl.searchParams.get("callback_url") as string);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("https://openrouter.ai/auth");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(authorizationUrl.toString()).not.toContain("client_secret");
    expect(callbackUrl.pathname).toBe(`/api/campaigns/${campaignId}/openrouter/callback`);
    expect(callbackUrl.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(setCookie).toContain(`${openRouterOAuthStateCookieName}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=600/i);
    expect(setCookie).toMatch(/Secure/i);
  });

  it("persists a verified callback key and clears the OAuth cookie", async () => {
    const pending = createOpenRouterOAuthState(campaignId, userId, secret);
    setOAuthCookie(pending.cookieValue);

    const response = await callback(callbackRequest(`state=${encodeURIComponent(pending.state)}&code=single-use-code`), routeContext());
    const location = locationUrl(response);

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(location.pathname).toBe(`/campaigns/${campaignId}/settings`);
    expect(location.searchParams.get("openrouter")).toBe("connected");
    expect(mocks.exchangeOpenRouterCode).toHaveBeenCalledWith("single-use-code", pending.codeVerifier);
    expect(mocks.saveCampaignCredential).toHaveBeenCalledWith(expect.objectContaining({
      campaignId,
      apiKey: "sk-or-v1-created",
      connectedBy: userId,
      resetPlayerAccess: true,
      metadata: expect.objectContaining({ label: "Star Board campaign key", verificationStatus: "verified" }),
    }));
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(JSON.stringify(await response.text())).not.toContain("sk-or-v1-created");
  });

  it("rejects a replay or mismatched OAuth state before exchanging a code", async () => {
    const pending = createOpenRouterOAuthState(campaignId, userId, secret);
    setOAuthCookie(pending.cookieValue);

    const response = await callback(callbackRequest("state=wrong-state&code=single-use-code"), routeContext());
    const location = locationUrl(response);

    expect(location.searchParams.get("openrouter")).toBe("error");
    expect(location.searchParams.get("reason")).toBe("invalid_state");
    expect(mocks.exchangeOpenRouterCode).not.toHaveBeenCalled();
    expect(mocks.saveCampaignCredential).not.toHaveBeenCalled();
  });

  it("handles provider cancellation without creating a credential", async () => {
    const pending = createOpenRouterOAuthState(campaignId, userId, secret);
    setOAuthCookie(pending.cookieValue);

    const response = await callback(callbackRequest(`state=${encodeURIComponent(pending.state)}&error=access_denied`), routeContext());
    const location = locationUrl(response);

    expect(location.searchParams.get("openrouter")).toBe("cancelled");
    expect(mocks.exchangeOpenRouterCode).not.toHaveBeenCalled();
    expect(mocks.saveCampaignCredential).not.toHaveBeenCalled();
  });

  it("refreshes safe metadata and marks a rejected provider key invalid", async () => {
    const refreshedStatus = { ...credentialStatus, remainingUsd: 7, usageUsd: 3 };
    mocks.getCampaignCredentialStatusForManager.mockResolvedValue({ status: refreshedStatus });

    const refreshed = await refresh(request(`/api/campaigns/${campaignId}/openrouter/refresh`, { method: "POST" }), routeContext());
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toEqual({ credential: refreshedStatus });
    expect(mocks.getOpenRouterKeyMetadata).toHaveBeenCalledWith("sk-or-v1-campaign");
    expect(mocks.updateCampaignCredentialMetadata).toHaveBeenCalledWith(campaignId, expect.objectContaining({ verificationStatus: "verified", remainingUsd: 8 }));

    mocks.getOpenRouterKeyMetadata.mockRejectedValueOnce(new OpenRouterOAuthError("The campaign OpenRouter key was rejected.", 401));
    const rejected = await refresh(request(`/api/campaigns/${campaignId}/openrouter/refresh`, { method: "POST" }), routeContext());
    const rejectedPayload = await rejected.json();

    expect(rejected.status).toBe(409);
    expect(rejectedPayload).toMatchObject({ code: "invalid" });
    expect(mocks.markCampaignCredentialInvalid).toHaveBeenCalledWith(campaignId, "The campaign OpenRouter key was rejected.");
  });

  it("keeps status, player access, and disconnect operations manager-authorized", async () => {
    const statusResponse = await status(request(`/api/campaigns/${campaignId}/openrouter`), routeContext());
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({ credential: credentialStatus });

    const playerResponse = await updatePlayerAi(request(`/api/campaigns/${campaignId}/openrouter`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowPlayerAi: true }),
    }), routeContext());
    expect(playerResponse.status).toBe(200);
    expect(mocks.setCampaignPlayerAi).toHaveBeenCalledWith(campaignId, context.supabase, userId, true);

    const disconnectResponse = await disconnect(request(`/api/campaigns/${campaignId}/openrouter`, { method: "DELETE" }), routeContext());
    expect(disconnectResponse.status).toBe(200);
    expect(mocks.disconnectCampaignCredential).toHaveBeenCalledWith(campaignId, context.supabase, userId);
  });
});
