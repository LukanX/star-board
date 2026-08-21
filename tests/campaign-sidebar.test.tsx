import { renderToStaticMarkup } from "react-dom/server";
import { UserRound } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));

import CampaignSidebar from "@/components/campaign-shell/CampaignSidebar";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import SectionHeading from "@/components/ui/SectionHeading";

describe("CampaignSidebar route navigation", () => {
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
    expect(markup).toContain('<a class="nav-item nav-item-active"');
    expect(markup).not.toContain('<button class="nav-item nav-item-active"');
  });

  it("renders overview section actions as canonical links", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <SectionHeading action="Manage" actionHref="/campaigns/campaign-42/members" eyebrow="CREW MANIFEST" title="On the roster" />
      </DirtyFormProvider>,
    );

    expect(markup).toContain('href="/campaigns/campaign-42/members"');
    expect(markup).toContain('class="text-action"');
  });
});