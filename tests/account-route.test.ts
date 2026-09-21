import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));

import { PATCH } from "@/app/api/account/profile/route";

const userId = "00000000-0000-4000-8000-000000000001";

function request(body: unknown) {
  return new Request("http://localhost/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(result: { data: unknown; error: unknown }) {
  const profileQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  profileQuery.update.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  profileQuery.select.mockReturnValue(profileQuery);

  return { from: vi.fn().mockReturnValue(profileQuery), profileQuery };
}

describe("account profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty account name before authenticating", async () => {
    const response = await PATCH(request({ displayName: "  " }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Account name is invalid.");
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await PATCH(request({ displayName: "Nova" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication is required." });
  });

  it("updates only the authenticated profile and returns the normalized name", async () => {
    const supabase = createSupabaseMock({ data: { display_name: "Nova" }, error: null });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await PATCH(request({ displayName: "  Nova  " }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ displayName: "Nova" });
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase.profileQuery.update).toHaveBeenCalledWith({
      display_name: "Nova",
      updated_at: expect.any(String),
    });
    expect(supabase.profileQuery.eq).toHaveBeenCalledWith("id", userId);
  });

  it("hides profile update failures", async () => {
    const supabase = createSupabaseMock({ data: null, error: new Error("database details") });
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });

    const response = await PATCH(request({ displayName: "Nova" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Account name could not be saved." });
  });
});