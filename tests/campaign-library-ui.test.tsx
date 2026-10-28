import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemLibraryEntry } from "@/lib/references/system-library";
import type { ReferenceStatus } from "@/lib/references/types";

const mocks = vi.hoisted(() => ({
  pathname: "/campaigns/campaign-42/library/ancestries",
  getAuthenticatedUser: vi.fn(),
  readSystemLibrary: vi.fn(),
  loadCampaignLibraryAccess: vi.fn(),
  readCampaignLibraryMembers: vi.fn(),
  getCampaignRouteAccess: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/auth/permissions", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/campaign/server", () => ({ getCampaignRouteAccess: mocks.getCampaignRouteAccess }));
vi.mock("@/lib/references/system-library", () => ({ readSystemLibrary: mocks.readSystemLibrary }));
vi.mock("@/lib/references/library-access", () => ({
  loadCampaignLibraryAccess: mocks.loadCampaignLibraryAccess,
  readCampaignLibraryMembers: mocks.readCampaignLibraryMembers,
}));
vi.mock("@/components/archive/CampaignArtField", () => ({ CampaignArtEditorSlot: () => null }));

import CampaignLibraryList from "@/app/campaigns/[campaignId]/library/[category]/page";
import CampaignLibraryDetail from "@/app/campaigns/[campaignId]/library/[category]/[referenceId]/page";
import CampaignLibraryAccess from "@/app/campaigns/[campaignId]/library/access/page";
import CampaignLibraryGeneration from "@/app/campaigns/[campaignId]/library/generation/page";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import SystemNavigation from "@/components/system/SystemNavigation";
import ReferenceSources from "@/components/ui/ReferenceSources";

const campaignId = "campaign-42";
const entry: SystemLibraryEntry = {
  reference_id: "sf2e.ancestries.Item.kasatha",
  kind: "ancestry",
  name: "Kasatha",
  catalog_version: "catalog-version",
  source_url: "https://example.test/source",
  publication: "Source publication",
  revision: 1,
  appearance: "Campaign appearance",
  lore: "Campaign lore",
  trait_context: "",
  source_notes: "Attribution",
  updated_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/campaigns/campaign-42/library/ancestries";
  mocks.getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "owner" } });
  mocks.readSystemLibrary.mockResolvedValue([entry]);
  mocks.loadCampaignLibraryAccess.mockResolvedValue({ owner: true, member: true, canEdit: true });
  mocks.getCampaignRouteAccess.mockResolvedValue({ role: "gm" });
});

describe("campaign library presentation", () => {
  it("uses campaign links and highlights a category on its detail pages", () => {
    mocks.pathname += "/sf2e.ancestries.Item.kasatha";
    const markup = renderToStaticMarkup(<DirtyFormProvider>
      <SystemNavigation campaignId={campaignId} access={{ owner: true, canEdit: true }} isGM />
    </DirtyFormProvider>);
    expect(markup.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/campaigns/campaign-42/library/ancestries"');
    expect(markup).toContain('href="/campaigns/campaign-42/library/access"');
    expect(markup).toContain('href="/campaigns/campaign-42/library/generation"');
    expect(markup).not.toContain("Return to campaign");
    expect(markup).not.toContain('href="/system');
  });

  it("does not offer owner or GM controls to a player editor", () => {
    const markup = renderToStaticMarkup(<DirtyFormProvider>
      <SystemNavigation campaignId={campaignId} access={{ owner: false, canEdit: true }} isGM={false} />
    </DirtyFormProvider>);
    expect(markup).toContain("ACCESS: EDITOR");
    expect(markup).not.toContain("Library access");
    expect(markup).not.toContain("Generation context");
  });

  it("renders searchable names only, without coverage, prose, source IDs or campaign query parameters", async () => {
    const page = await CampaignLibraryList({
      params: Promise.resolve({ campaignId, category: "ancestries" }),
      searchParams: Promise.resolve({ q: "kAs", missing: "appearance", campaign: "another-campaign" }),
    });
    const markup = renderToStaticMarkup(<DirtyFormProvider>{page}</DirtyFormProvider>);
    expect(mocks.readSystemLibrary).toHaveBeenCalledWith({}, undefined, campaignId);
    expect(markup).toContain("Kasatha</a>");
    expect(markup).toContain("1 of 1 entries");
    expect(markup).toContain('action="/campaigns/campaign-42/library/ancestries"');
    expect(markup).not.toContain("Campaign appearance");
    expect(markup).not.toContain("Campaign lore");
    expect(markup).not.toContain("Coverage");
    expect(markup).not.toContain("Appearance:");
    expect(markup).not.toContain('name="campaign"');
  });

  it("renders an explicit empty search result", async () => {
    const page = await CampaignLibraryList({
      params: Promise.resolve({ campaignId, category: "ancestries" }),
      searchParams: Promise.resolve({ q: "not a name" }),
    });
    const markup = renderToStaticMarkup(<DirtyFormProvider>{page}</DirtyFormProvider>);
    expect(markup).toContain("No matching entries");
    expect(markup).toContain("0 of 1 entries");
  });

  it("reads detail content from the route's campaign and preserves editing", async () => {
    const page = await CampaignLibraryDetail({
      params: Promise.resolve({ campaignId, category: "ancestries", referenceId: entry.reference_id }),
    });
    const markup = renderToStaticMarkup(<DirtyFormProvider>{page}</DirtyFormProvider>);
    expect(mocks.readSystemLibrary).toHaveBeenCalledWith({}, [entry.reference_id], campaignId);
    expect(markup).toContain("Campaign appearance");
    expect(markup).toContain('id="system-appearance"');
    expect(markup).toContain("IMPORTED REFERENCE SOURCE");
    expect(markup).toContain('href="/campaigns/campaign-42/library/ancestries"');
  });

  it("does not load the member directory for a non-owner", async () => {
    mocks.loadCampaignLibraryAccess.mockResolvedValue({ owner: false, member: true, canEdit: true });
    const page = await CampaignLibraryAccess({
      params: Promise.resolve({ campaignId }), searchParams: Promise.resolve({}),
    });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Only this campaign");
    expect(mocks.readCampaignLibraryMembers).not.toHaveBeenCalled();
  });

  it("does not render context switches to a player on a direct generation URL", async () => {
    mocks.getCampaignRouteAccess.mockResolvedValue({ role: "player" });
    const markup = renderToStaticMarkup(await CampaignLibraryGeneration({ params: Promise.resolve({ campaignId }) }));
    expect(markup).toContain("Only campaign GMs");
    expect(markup).not.toContain('type="checkbox"');
  });

  it("links draft provenance to the same campaign's library entry", () => {
    const source: ReferenceStatus = {
      id: entry.reference_id, name: entry.name, kind: "ancestry", catalogVersion: entry.catalog_version,
      sourceUrl: entry.source_url, origin: "user-entered", revision: 1, coverage: "available", contextHash: "hash",
    };
    const markup = renderToStaticMarkup(<DirtyFormProvider><ReferenceSources sources={[source]} campaignId={campaignId} /></DirtyFormProvider>);
    expect(markup).toContain('href="/campaigns/campaign-42/library/ancestries/sf2e.ancestries.Item.kasatha"');
    expect(markup).not.toContain('href="/system');
  });
});
