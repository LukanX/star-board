import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));

import { GET } from "@/app/auth/callback/route";

function callbackUrl(query: string) {
  return new Request(`http://localhost/auth/callback?${query}`);
}

function location(response: Response) {
  return new URL(response.headers.get("location") ?? "");
}

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a valid code and preserves the safe destination", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mocks.getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

    const response = await GET(callbackUrl("code=valid&next=%2Faccount%3Femail%3Dconfirmed"));
    const destination = location(response);

    expect(response.status).toBe(307);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(destination.pathname).toBe("/account");
    expect(destination.searchParams.get("email")).toBe("confirmed");
  });

  it("falls back to campaigns for an unsafe destination", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mocks.getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

    const response = await GET(callbackUrl("code=valid&next=%2F%2Fevil.example%2Fsession"));

    expect(location(response).pathname).toBe("/campaigns");
  });

  it("returns a recovery destination when code exchange fails", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: new Error("expired code") });
    mocks.getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

    const response = await GET(callbackUrl("code=expired&next=%2Faccount%3Femail%3Dconfirmed"));
    const destination = location(response);

    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("error")).toBe("auth_callback");
    expect(destination.searchParams.get("next")).toBe("/account?email=error");
  });

  it("returns reset mode when a password reset code fails", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: new Error("expired code") });
    mocks.getSupabaseServerClient.mockResolvedValue({ auth: { exchangeCodeForSession } });

    const response = await GET(callbackUrl("code=expired&next=%2Flogin%2Freset-password"));
    const destination = location(response);

    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("mode")).toBe("reset");
    expect(destination.searchParams.get("error")).toBe("auth_callback");
  });

  it("handles provider errors without attempting a code exchange", async () => {
    const response = await GET(callbackUrl("error=access_denied&next=%2Faccount%3Femail%3Dconfirmed"));
    const destination = location(response);

    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("error")).toBe("auth_callback");
    expect(mocks.getSupabaseServerClient).not.toHaveBeenCalled();
  });
});