import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/settings/CampaignDetailsSettings", () => ({
  default: ({ campaignId }: { campaignId: string }) => <div data-settings-child="details">{campaignId}</div>,
}));
vi.mock("@/components/settings/CampaignVisualStyles", () => ({
  default: ({ campaignId }: { campaignId: string }) => <div data-settings-child="visuals">{campaignId}</div>,
}));
vi.mock("@/components/settings/OpenRouterConnectionSettings", () => ({
  default: ({ campaignId }: { campaignId: string }) => <div data-settings-child="openrouter">{campaignId}</div>,
}));
vi.mock("@/components/settings/CampaignAiSettings", () => ({
  default: ({ campaignId }: { campaignId: string }) => <div data-settings-child="ai">{campaignId}</div>,
}));

import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import SettingsRouteView from "@/components/settings/SettingsRouteView";

describe("settings route tabs", () => {
  it("renders campaign details as the default accessible tab", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <SettingsRouteView campaignId="campaign-42" initialCampaign={{ name: "Signal Lost", description: "A missing ship." }} />
      </DirtyFormProvider>,
    );

    expect(markup.match(/role="tab"/g) ?? []).toHaveLength(3);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="settings-tab-details"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-settings-tab-panel="details"');
    expect(markup).toContain('data-settings-child="details"');
    expect(markup).not.toContain('data-settings-child="visuals"');
    expect(markup).not.toContain('data-settings-child="ai"');
  });
});