import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OpenRouterConnectionSettings from "@/components/settings/OpenRouterConnectionSettings";

describe("OpenRouter connection callback feedback", () => {
  it("shows a safe configuration failure while status is loading", () => {
    const markup = renderToStaticMarkup(
      <OpenRouterConnectionSettings
        campaignId="campaign-42"
        callbackOutcome={{ reason: "configuration", status: "error" }}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Secure campaign key storage is not configured on the server.");
    expect(markup).toContain("LOADING CONNECTION STATUS");
  });

  it("does not render a connected success message before status reconciliation", () => {
    const markup = renderToStaticMarkup(
      <OpenRouterConnectionSettings
        campaignId="campaign-42"
        callbackOutcome={{ status: "connected" }}
      />,
    );

    expect(markup).not.toContain("connected and verified");
    expect(markup).toContain("LOADING CONNECTION STATUS");
  });
});