import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicEnv: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getPublicEnv: mocks.getPublicEnv }));

import { getEmailChangeRedirect, getPasswordResetRedirect, getPublicAppOrigin } from "@/lib/app-url";

describe("public app URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the configured public origin and removes a trailing slash", () => {
    mocks.getPublicEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://star-board.example/" });

    expect(getPublicAppOrigin("http://localhost:3000")).toBe("https://star-board.example");
  });

  it("uses the supplied origin when no public URL is configured", () => {
    mocks.getPublicEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: undefined });

    expect(getPublicAppOrigin("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("builds the password reset callback on the public origin", () => {
    mocks.getPublicEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://star-board.example" });

    expect(getPasswordResetRedirect("http://localhost:3000")).toBe(
      "https://star-board.example/auth/callback?next=/login/reset-password",
    );
  });

  it("builds the email confirmation callback on the public origin", () => {
    mocks.getPublicEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://star-board.example" });

    expect(getEmailChangeRedirect("http://localhost:3000")).toBe(
      "https://star-board.example/auth/callback?next=/account?email=confirmed",
    );
  });
});