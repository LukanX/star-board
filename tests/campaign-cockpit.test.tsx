import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CampaignCockpit from "@/components/campaign-cockpit/CampaignCockpit";

describe("CampaignCockpit initial render", () => {
  it("renders the loading state before campaign data is loaded", () => {
    expect(() => renderToStaticMarkup(<CampaignCockpit initialCampaignId="campaign-42" />)).not.toThrow();
    expect(renderToStaticMarkup(<CampaignCockpit initialCampaignId="campaign-42" />)).toContain("Loading campaign signal.");
  });
});