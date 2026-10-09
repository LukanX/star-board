import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DirtyFormProvider } from "@/components/campaign-shell/DirtyFormProvider";
import CampaignNarrativeSettings from "@/components/settings/CampaignNarrativeSettings";

describe("campaign narrative settings panel", () => {
  it("renders the private setting field, accessible preset checkboxes, custom tags, and bounded count", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <CampaignNarrativeSettings
          campaignId="00000000-0000-4000-8000-000000000001"
          initialSettings={{ setting: "A research station beyond the Drift.", styleTags: ["Space Opera", "found family"] }}
        />
      </DirtyFormProvider>,
    );

    expect(markup).toContain("GM ONLY // NARRATIVE CONTEXT");
    expect(markup).toContain('aria-describedby="campaign-setting-hint"');
    expect(markup).toContain("A research station beyond the Drift.");
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain("Space Opera");
    expect(markup).toContain("found family");
    expect(markup).toContain('aria-label="Remove narrative style tag found family"');
    expect(markup).toContain("2/8 TAGS SELECTED");
    expect(markup).toContain('aria-label="Add custom narrative style tag"');
    expect(markup).toContain("SAVE NARRATIVE SETTINGS");
  });
});