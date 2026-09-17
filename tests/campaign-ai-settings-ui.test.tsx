import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import CampaignAiSettings from "@/components/archive/CampaignAiSettings";

describe("campaign AI settings layout", () => {
  it("keeps the available model catalog in a bounded scrolling region before save", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <CampaignAiSettings campaignId="campaign-42" />
      </DirtyFormProvider>,
    );
    const catalogIndex = markup.indexOf("data-campaign-ai-model-catalog");
    const saveIndex = markup.indexOf("SAVE AI PREFERENCES");

    expect(catalogIndex).toBeGreaterThan(-1);
    expect(markup).toContain('aria-label="Available campaign AI models"');
    expect(markup).toContain("h-[360px]");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("overscroll-contain");
    expect(catalogIndex).toBeLessThan(saveIndex);
  });
});