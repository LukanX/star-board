import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));

import AccountSettings from "@/components/account/AccountSettings";

describe("account settings", () => {
  it("renders global identity, email access, and campaign identity controls", () => {
    const markup = renderToStaticMarkup(
      <AccountSettings
        campaign={{ id: "campaign-42", name: "Signal Lost", displayName: "Nova" }}
        displayName="Captain Nova"
        email="nova@example.com"
        emailStatus={null}
      />,
    );

    expect(markup).toContain("DEFAULT ACCOUNT NAME");
    expect(markup).toContain("EMAIL ACCESS");
    expect(markup).toContain("ACTIVE CAMPAIGN IDENTITY");
    expect(markup).toContain("Changing it does not change your global account name.");
    expect(markup).toContain('href="/campaigns/campaign-42"');
  });

  it("surfaces an email confirmation result", () => {
    const markup = renderToStaticMarkup(
      <AccountSettings campaign={null} displayName="Captain Nova" email="nova@example.com" emailStatus="confirmed" />,
    );

    expect(markup).toContain("Email address confirmed.");
    expect(markup).not.toContain("ACTIVE CAMPAIGN IDENTITY");
  });
});