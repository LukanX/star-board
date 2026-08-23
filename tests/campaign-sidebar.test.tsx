import { renderToStaticMarkup } from "react-dom/server";
import { UserRound } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/campaigns/campaign-42" }));

import CampaignSidebar from "@/components/campaign-shell/CampaignSidebar";
import CampaignRouteShell from "@/components/campaign-shell/CampaignRouteShell";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import SectionHeading from "@/components/ui/SectionHeading";

describe("CampaignSidebar route navigation", () => {
  it("keeps the campaign shell mounted on the overview route", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <CampaignRouteShell campaignId="campaign-42" campaignName="Signal Lost" displayName="Director" isGM>
          <div>Overview content</div>
        </CampaignRouteShell>
      </DirtyFormProvider>,
    );

    expect(markup.match(/data-campaign-shell/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-campaign-sidebar/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-campaign-topbar/g) ?? []).toHaveLength(1);
  });

  it("renders campaign sections as canonical links instead of SPA selection buttons", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <CampaignSidebar
          activeView="npcs"
          campaignName="Signal Lost"
          campaignSwitchHref="/campaigns"
          displayName="Director"
          isGM
          mobileOpen={false}
          navItems={[{ label: "Archive", items: [{ id: "npcs", label: "NPCs", icon: UserRound, href: "/campaigns/campaign-42/npcs" }] }]}
          onCloseMobile={() => undefined}
        />
      </DirtyFormProvider>,
    );

    expect(markup).toContain('href="/campaigns/campaign-42/npcs"');
    expect(markup).toMatch(/<a class="[^"]*bg-\[rgba\(98,232,255,\.095\)\][^"]*" href="\/campaigns\/campaign-42\/npcs"/);
    expect(markup).not.toMatch(/<button[^>]*href="\/campaigns\/campaign-42\/npcs"/);
  });

  it("renders overview section actions as canonical links", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <SectionHeading action="Manage" actionHref="/campaigns/campaign-42/members" eyebrow="CREW MANIFEST" title="On the roster" />
      </DirtyFormProvider>,
    );

    expect(markup).toContain('href="/campaigns/campaign-42/members"');
    expect(markup).toMatch(/class="[^"]*\btext-action\b[^"]*"/);
  });
});