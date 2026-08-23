# Archive Master-Detail Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore local selector previews for Places, NPCs, and Factions, and make their canonical full-record pages share the current Place-derived layout with campaign-facing related records.

**Architecture:** Add a client-side `ArchiveMasterDetail` shell for the shared two-panel list layout and an `ArchiveRecordShell` for the shared full-record framing. Domain route views retain ownership of collection state, search, editors, selection, and domain-specific preview/record content. Extend the existing authenticated server helpers to return typed related summaries while passing one server-loaded Place collection into NPC, Faction, and Place detail routes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase SSR/RLS, Vitest, and Playwright.

**Spec:** `docs/superpowers/specs/2026-08-22-archive-master-detail-records-design.md`

## Global Constraints

- Preserve all current canonical campaign section and entity paths.
- Selection changes local preview state only; the explicit full-record link performs canonical navigation.
- Keep campaign membership, GM/player privacy, RLS, signed-art, dirty-form, loading, not-found, pending, and mutation-error behavior intact.
- Do not add schema migrations, RLS policies, dependencies, query-string selection state, or browser-storage selection state.
- Use existing design tokens, `panelClassName`, record-style helpers, Lucide icons, and statically discoverable Tailwind classes.
- Keep feature-specific selectors out of `app/globals.css`.
- Do not modify generated `.next/`, `.next-deploy/`, `.next-playwright/`, `.netlify/`, or `next-env.d.ts` output.
- Run focused tests immediately after each implementation slice; do not claim completion without executable validation.
- Do not commit or deploy unless the user explicitly requests it.

---

### Task 1: Add shared archive UI contracts

**Files:**
- Create: `components/ui/ArchiveMasterDetail.tsx`
- Create: `components/ui/ArchiveRecordShell.tsx`
- Create: `components/ui/ArchiveRelatedList.tsx`
- Create: `lib/campaign/detail-types.ts`
- Modify: `components/ui/recordStyles.ts`
- Test: `tests/archive-detail-ui.test.tsx`

**Interfaces:**
- `ArchiveMasterDetail` consumes `selectedId: string | null`, a toolbar node, selector metadata/content, preview content, and an empty-preview node; it produces the shared responsive selector/preview markup and manages mobile preview reveal/focus when `selectedId` changes.
- `ArchiveRecordShell` consumes a back destination/label, heading content, optional actions, artwork, body, and related content; it produces the shared full-record panel framing.
- `ArchiveRelatedList` consumes `{ eyebrow, title, emptyMessage, items }`, where each item is `{ id, href, label, meta?: string, icon?: ReactNode }`; it produces accessible canonical linked summaries.
- `detail-types.ts` exports `RelatedPlaceSummary`, `RelatedNpcSummary`, `RelatedFactionSummary`, `RelatedJobSummary`, `RelatedEpisodeSummary`, `PlaceRelatedRecords`, `NpcRelatedRecords`, and `FactionRelatedRecords`.

- [ ] **Step 1: Write the failing shared-shell tests.**

Add `tests/archive-detail-ui.test.tsx` with static-rendering contracts for the shared shells:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArchiveMasterDetail from "@/components/ui/ArchiveMasterDetail";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";

describe("ArchiveMasterDetail", () => {
  it("renders stable selector and preview panels with the selected preview", () => {
    const markup = renderToStaticMarkup(
      <ArchiveMasterDetail
        selectedId="npc-1"
        toolbar={<div data-testid="toolbar">NPC TOOLBAR</div>}
        selectorEyebrow="ARCHIVE"
        selectorTitle="Contacts"
        selectorIcon={<span aria-hidden="true">ICON</span>}
        selector={<button type="button">Rook</button>}
        preview={<div data-testid="selected-preview">Rook preview</div>}
        emptyPreview={<div>Choose a contact.</div>}
      />,
    );

    expect(markup).toContain('data-archive-master-detail="true"');
    expect(markup).toContain('data-archive-selector-panel="true"');
    expect(markup).toContain('data-archive-preview-panel="true"');
    expect(markup).toContain('data-testid="selected-preview"');
    expect(markup).not.toContain("Choose a contact.");
    expect(markup).toContain("max-[760px]:grid-cols-1");
  });

  it("renders the prompt when no record is selected", () => {
    const markup = renderToStaticMarkup(
      <ArchiveMasterDetail
        selectedId={null}
        toolbar={null}
        selectorEyebrow="ARCHIVE"
        selectorTitle="Contacts"
        selectorIcon={<span aria-hidden="true">ICON</span>}
        selector={<button type="button">Rook</button>}
        preview={<div>Rook preview</div>}
        emptyPreview={<div data-testid="empty-preview">Choose a contact.</div>}
      />,
    );

    expect(markup).toContain('data-testid="empty-preview"');
    expect(markup).not.toContain("Rook preview");
  });
});

describe("ArchiveRecordShell", () => {
  it("renders the Place-derived full-record hierarchy and related slot", () => {
    const markup = renderToStaticMarkup(
      <ArchiveRecordShell
        backHref="/campaigns/campaign-1/places"
        backLabel="BACK TO PLACES"
        eyebrow="STATION RECORD"
        title="North Station"
        titleId="place-record-title"
        metadata={<span>planet</span>}
        actions={<button type="button" aria-label="Edit North Station">EDIT</button>}
        artwork={<div data-testid="artwork">ART</div>}
        body={<div data-testid="body">BODY</div>}
        related={<div data-testid="related">RELATED</div>}
      />,
    );

    expect(markup).toContain('data-archive-record="true"');
    expect(markup).toContain('aria-labelledby="place-record-title"');
    expect(markup).toContain("BACK TO PLACES");
    expect(markup).toContain('data-testid="artwork"');
    expect(markup).toContain('data-testid="body"');
    expect(markup).toContain('data-testid="related"');
    expect(markup).toContain("min-h-[430px]");
  });
});

describe("ArchiveRelatedList", () => {
  it("renders canonical linked summaries and intentional empty copy", () => {
    const populated = renderToStaticMarkup(
      <ArchiveRelatedList
        eyebrow="ASSIGNED JOBS"
        title="Jobs"
        emptyMessage="No jobs assigned."
        items={[{ id: "job-1", href: "/campaigns/campaign-1/jobs/job-1", label: "The Relay", meta: "OPEN" }]}
      />,
    );
    const empty = renderToStaticMarkup(
      <ArchiveRelatedList eyebrow="ASSIGNED JOBS" title="Jobs" emptyMessage="No jobs assigned." items={[]} />,
    );

    expect(populated).toContain('href="/campaigns/campaign-1/jobs/job-1"');
    expect(populated).toContain("The Relay");
    expect(empty).toContain("No jobs assigned.");
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure.**

Run: `npm test -- tests/archive-detail-ui.test.tsx`

Expected: FAIL because the three new shared components do not exist yet. If the test fails for JSX, alias, or fixture reasons instead, correct the test setup before writing production code.

- [ ] **Step 3: Implement the shared shells and related types.**

Define the shared detail types as explicit groups:

```ts
export type RelatedPlaceSummary = { id: string; name: string; kind: string };
export type RelatedNpcSummary = { id: string; name: string; species: string; role: string };
export type RelatedFactionSummary = { id: string; name: string; status: string };
export type RelatedJobSummary = { id: string; title: string; status: "draft" | "open" | "promoted" | "archived" };
export type RelatedEpisodeSummary = { id: string; title: string; status: "planned" | "active" | "complete" | "archived" };

export type PlaceRelatedRecords = {
  parent: RelatedPlaceSummary | null;
  children: RelatedPlaceSummary[];
  npcs: RelatedNpcSummary[];
  factions: RelatedFactionSummary[];
  jobs: RelatedJobSummary[];
  episodes: RelatedEpisodeSummary[];
};

export type NpcRelatedRecords = {
  place: RelatedPlaceSummary | null;
  jobs: RelatedJobSummary[];
};

export type FactionRelatedRecords = {
  place: RelatedPlaceSummary | null;
  jobs: RelatedJobSummary[];
};
```

Implement `ArchiveMasterDetail` as a client component. Its stable markup must include `data-archive-master-detail`, `data-archive-selector-panel`, and `data-archive-preview-panel`; preserve the Places grid proportions and panel classes; put the preview before the selector at the existing mobile breakpoint; and render `preview` only when `selectedId` is non-null. Put `data-archive-preview-heading` and `tabIndex={-1}` on the preview wrapper or heading contract. In an effect keyed by `selectedId`, find that heading, focus it, and call `scrollIntoView` on mobile only. Use `matchMedia("(prefers-reduced-motion: reduce)")` to choose `"auto"` or `"smooth"` scrolling, and guard the browser-only APIs inside the effect.

Implement `ArchiveRecordShell` with `panelDataAttribute?: string` and `contentDataAttribute?: string` escape hatches so existing Place data hooks remain stable while the shared shell adds `data-archive-record="true"`. Render the canonical back link, heading/action row, artwork slot, body slot, and related slot with the current Place panel classes and responsive padding. Keep `titleId` on the rendered heading and use `aria-labelledby` on the section.

Implement `ArchiveRelatedList` with a semantic section, eyebrow/title heading, intentional empty copy, and `Link` rows. Each row must retain the provided `href`, label, optional metadata, and optional icon without exposing internal IDs or timestamps. Add any shared archive layout/select/toolbar class constants to `components/ui/recordStyles.ts` only when they are reused by at least two route views.

- [ ] **Step 4: Run the focused test and verify the shared contracts pass.**

Run: `npm test -- tests/archive-detail-ui.test.tsx`

Expected: PASS with no new warnings. Do not begin domain integration until the shared primitives pass their focused test.

### Task 2: Add campaign-scoped related detail data

**Files:**
- Modify: `lib/campaign/places-server.ts`
- Modify: `lib/campaign/npcs-server.ts`
- Modify: `lib/campaign/factions-server.ts`
- Modify: `app/campaigns/[campaignId]/places/[placeId]/page.tsx`
- Modify: `app/campaigns/[campaignId]/npcs/page.tsx`
- Modify: `app/campaigns/[campaignId]/npcs/[npcId]/page.tsx`
- Modify: `app/campaigns/[campaignId]/factions/page.tsx`
- Modify: `app/campaigns/[campaignId]/factions/[factionId]/page.tsx`
- Test: `tests/places-server.test.ts`
- Test: `tests/npc-faction-server.test.ts`

**Interfaces:**
- Change `CampaignPlaceResult` to `{ role, displayName, place, related: PlaceRelatedRecords }`.
- Change `CampaignNpcResult` to `{ role, displayName, npc, related: NpcRelatedRecords }`.
- Change `CampaignFactionResult` to `{ role, displayName, faction, related: FactionRelatedRecords }`.
- Require each detail helper to accept `placesResultPromise: Promise<CampaignPlacesResult | null>` as its third argument. The route page starts `getCampaignPlaces(campaignId)` once and passes that promise to the detail helper, so the detail helper derives parent/child/primary Place summaries from the already loaded collection without issuing a second Place query.

- [ ] **Step 1: Add failing server-helper tests for related groups and shared Place context.**

Extend `tests/places-server.test.ts` with a detail fixture that passes a resolved Places result and four related query chains. Assert the returned groups and every entity query's campaign filter:

```ts
it("returns campaign-scoped Place relations from the shared Place collection", async () => {
  const place = { id: "place-1", campaign_id: "campaign-1", parent_place_id: "parent-1", name: "Night Market", kind: "district", art_path: null };
  const parent = { id: "parent-1", campaign_id: "campaign-1", parent_place_id: null, name: "Asterion", kind: "planet", art_path: null };
  const child = { id: "child-1", campaign_id: "campaign-1", parent_place_id: "place-1", name: "Gate", kind: "checkpoint", art_path: null };
  const placesResult = Promise.resolve({ role: "gm" as const, displayName: "GM", places: [parent, place, child] });
  const placeNpcsQuery = queryChain({ data: [{ id: "npc-1", name: "Rook", species: "Android", role: "Contact" }], error: null });
  const placeFactionsQuery = queryChain({ data: [{ id: "faction-1", name: "The Accord", status: "active" }], error: null });
  const placeJobsQuery = queryChain({ data: [{ id: "job-1", title: "The Relay", status: "open" }], error: null });
  const placeEpisodesQuery = queryChain({ data: [{ id: "episode-1", title: "Signal Lost", status: "active" }], error: null });
  const supabase = { from: vi.fn().mockReturnValueOnce(placeNpcsQuery).mockReturnValueOnce(placeFactionsQuery).mockReturnValueOnce(placeJobsQuery).mockReturnValueOnce(placeEpisodesQuery) };
  mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: "user-1" } });
  mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "GM" });

  const { getCampaignPlace } = await import("@/lib/campaign/places-server");
  const result = await getCampaignPlace("campaign-1", "place-1", placesResult);

  expect(result?.related).toEqual({
    parent: { id: "parent-1", name: "Asterion", kind: "planet" },
    children: [{ id: "child-1", name: "Gate", kind: "checkpoint" }],
    npcs: [{ id: "npc-1", name: "Rook", species: "Android", role: "Contact" }],
    factions: [{ id: "faction-1", name: "The Accord", status: "active" }],
    jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
    episodes: [{ id: "episode-1", title: "Signal Lost", status: "active" }],
  });
  expect(placeNpcsQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  expect(placeFactionsQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  expect(placeJobsQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
  expect(placeEpisodesQuery.eq).toHaveBeenCalledWith("campaign_id", "campaign-1");
});
```

Extend `tests/npc-faction-server.test.ts` with one NPC and one Faction detail case. Pass the same resolved Places-result shape, return a giver-job query for each detail helper, and assert the primary Place summary plus the typed job summary. Assert the job queries use both `campaign_id` and the appropriate `giver_npc_id` or `giver_faction_id` filter. Add a player case that supplies a Place collection containing no private fields and verifies that `related` contains no GM-only values.

- [ ] **Step 2: Run the focused server tests and verify they fail for missing related data.**

Run: `npm test -- tests/places-server.test.ts tests/npc-faction-server.test.ts`

Expected: FAIL because the current detail results do not expose `related` and the helpers do not accept the shared Place promise. Existing authentication and missing-record tests may continue to pass; the new assertions must be the failures.

- [ ] **Step 3: Implement the related queries and route-page promise flow.**

In each detail helper, authenticate and authorize exactly as before. Await the supplied Places promise only to derive the selected/parent/child/primary summary. Keep only `{ id, name, kind }` for Places, `{ id, name, species, role }` for NPCs, `{ id, name, status }` for Factions, `{ id, title, status }` for Jobs, and `{ id, title, status }` for Episodes.

For Place detail, query assigned NPCs, Factions, Jobs, and Episodes in parallel with `.eq("campaign_id", campaignId)` and the matching `.eq("place_id", placeId)`. For NPC and Faction detail, query giver Jobs in parallel with `.eq("campaign_id", campaignId)` and `.eq("giver_npc_id", npcId)` or `.eq("giver_faction_id", factionId)`. Throw a descriptive error if any relation query fails; never replace a failed query with an empty array.

Change the route pages to start and share one Places promise:

```tsx
const placesPromise = getCampaignPlaces(campaignId);
const detailPromise = getCampaignNpc(campaignId, npcId, placesPromise);
const [placesResult, result] = await Promise.all([placesPromise, detailPromise]);
if (!placesResult || !result) notFound();
return <NpcDetailRouteView campaignId={campaignId} initialResult={result} initialPlaces={placesResult.places} />;
```

Use the same pattern for Place and Faction detail pages. For NPC and Faction list pages, load `getCampaignNpcs`/`getCampaignFactions` and `getCampaignPlaces` in one `Promise.all`, then pass `initialPlaces` into the route view. Do not retain the client-side `fetchCampaignPlaces` effect.

- [ ] **Step 4: Run the focused server tests and verify related data is green.**

Run: `npm test -- tests/places-server.test.ts tests/npc-faction-server.test.ts`

Expected: PASS, including the pre-existing unauthenticated, campaign-scoping, private-note, and missing-record tests.

### Task 3: Restore the Place selector and preview

**Files:**
- Create: `components/places/PlacePreview.tsx`
- Modify: `components/places/PlaceCard.tsx`
- Modify: `components/places/PlacesRouteView.tsx`
- Test: `tests/ui.test.tsx`
- Test: `tests/archive-previews.test.tsx`

**Interfaces:**
- `PlaceCard` consumes `selected: boolean` and `onSelect: (placeId: string) => void` in addition to its existing tree/GM props; its primary row becomes a button while chevron and add-child controls remain separate.
- `PlacePreview` consumes `{ campaignId, place, places, isGM }` and renders a role-visible summary plus the canonical full-record link.
- `PlacesRouteView` owns `selectedPlaceId: string | null`, derives the selected Place from `places`, and passes `selected`/`onSelect` to both tree rows and search-result rows.

- [ ] **Step 1: Write failing Place selector/preview tests.**

Update the existing `PlaceCard` contract in `tests/ui.test.tsx` to render a selected card with `onSelect={() => undefined}` and assert a button with `aria-pressed="true"`, `aria-controls="archive-preview-panel"`, and an accessible label containing the Place name. Add `tests/archive-previews.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlacePreview from "@/components/places/PlacePreview";

describe("PlacePreview", () => {
  it("shows campaign-facing summary and the canonical full-record action", () => {
    const markup = renderToStaticMarkup(
      <PlacePreview
        campaignId="campaign-1"
        isGM
        places={[{ id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "North Station", kind: "station", author_id: "gm-1", description: "An abandoned relay station.", player_notes_markdown: "The signal starts here.", art_subject: null, art_path: null, art_url: null, art_prompt: null, art_provider: null, created_at: "2026-08-22T00:00:00.000Z", updated_at: "2026-08-22T00:00:00.000Z", gm_notes_markdown: "The door is trapped." }]}
        place={{ id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "North Station", kind: "station", author_id: "gm-1", description: "An abandoned relay station.", player_notes_markdown: "The signal starts here.", art_subject: null, art_path: null, art_url: null, art_prompt: null, art_provider: null, created_at: "2026-08-22T00:00:00.000Z", updated_at: "2026-08-22T00:00:00.000Z", gm_notes_markdown: "The door is trapped." }}
      />,
    );

    expect(markup).toContain('data-place-preview="true"');
    expect(markup).toContain('data-archive-preview-heading="true"');
    expect(markup).toContain("An abandoned relay station.");
    expect(markup).toContain("The door is trapped.");
    expect(markup).toContain('href="/campaigns/campaign-1/places/place-1"');
    expect(markup).toContain("OPEN FULL RECORD");
  });

  it("omits private Place notes for players", () => {
    const markup = renderToStaticMarkup(
      <PlacePreview
        campaignId="campaign-1"
        isGM={false}
        places={[]}
        place={{ id: "place-1", campaign_id: "campaign-1", parent_place_id: null, name: "North Station", kind: "station", author_id: "gm-1", description: "Public.", player_notes_markdown: "Visible.", art_subject: null, art_path: null, art_url: null, art_prompt: null, art_provider: null, created_at: "2026-08-22T00:00:00.000Z", updated_at: "2026-08-22T00:00:00.000Z", gm_notes_markdown: "Hidden." }}
      />,
    );

    expect(markup).toContain("Visible.");
    expect(markup).not.toContain("Hidden.");
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the expected missing-prop/module failures.**

Run: `npm test -- tests/ui.test.tsx tests/archive-previews.test.tsx`

Expected: FAIL because the Place card does not yet accept selection props and `PlacePreview` does not exist.

- [ ] **Step 3: Implement local Place selection and preview rendering.**

In `PlacesRouteView`, add `const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)` and derive `selectedPlace` from the current collection. Preserve the existing prompt when it is null. Pass a toolbar node and the existing tree/search selector into `ArchiveMasterDetail`; render `PlacePreview` when selected. Keep `search` filtering independent of selection so a filtered-out selected Place remains previewed. On successful creation, insert the new Place, set its ID as selected, and close the editor. On deletion, clear selection only when the deleted ID is selected.

Change `PlaceCard` and search-result rows from navigation links to selection buttons. The selection button must set `aria-pressed`, `aria-controls="archive-preview-panel"`, and an accessible name such as `Select North Station`. Keep the tree chevron and GM add-child button as independent buttons. Keep `campaignEntityPath` only in `PlacePreview`'s `OPEN FULL RECORD` link.

Use the existing Places toolbar wording, search fields, tree expansion behavior, empty states, panel proportions, and data hooks. Add a selected visual treatment through complete literal class strings; do not add global CSS.

- [ ] **Step 4: Run the focused Place tests and verify the selector/preview contracts pass.**

Run: `npm test -- tests/ui.test.tsx tests/archive-previews.test.tsx tests/archive-detail-ui.test.tsx`

Expected: PASS with existing Place tree styling assertions preserved and no old detail-route link inside a selector row.

### Task 4: Add NPC and Faction selectors and previews

**Files:**
- Create: `components/npcs/NpcPreview.tsx`
- Create: `components/factions/FactionPreview.tsx`
- Modify: `components/npcs/NpcCard.tsx`
- Modify: `components/factions/FactionCard.tsx`
- Modify: `components/npcs/NpcsRouteView.tsx`
- Modify: `components/factions/FactionsRouteView.tsx`
- Test: `tests/ui.test.tsx`
- Test: `tests/archive-previews.test.tsx`

**Interfaces:**
- `NpcCard` consumes `{ npc, selected, onSelect }` and renders a selection button with `aria-pressed`/`aria-controls`.
- `FactionCard` consumes `{ faction, selected, onSelect, places }` and renders a selection button with `aria-pressed`/`aria-controls`.
- `NpcPreview` consumes `{ campaignId, npc, places, isGM }`.
- `FactionPreview` consumes `{ campaignId, faction, places }`.
- `NpcsRouteView` and `FactionsRouteView` consume `initialPlaces: ApiPlace[]` and own local selection/search/editor state without a client Place fetch effect.

- [ ] **Step 1: Write failing NPC/Faction selector and preview tests.**

Extend `tests/ui.test.tsx` so the NPC and Faction card fixtures provide `selected` and `onSelect`, and assert both render buttons with `aria-controls="archive-preview-panel"`. Add static preview tests covering canonical full-record links, location breadcrumbs, and privacy:

```tsx
it("renders NPC and Faction previews with canonical full-record links", () => {
  const npcMarkup = renderToStaticMarkup(
    <NpcPreview campaignId="campaign-1" isGM places={[]} npc={{ id: "npc-1", author_id: "gm-1", name: "Rook", species: "Android", role: "Contact", description: "Keeps the signal alive.", player_notes_markdown: "Trusted.", place_id: null, gm_notes_markdown: "Watch the airlock.", art_subject: null, art_path: null, art_url: null, art_prompt: null, art_provider: null, color: "pink" }} />,
  );
  const factionMarkup = renderToStaticMarkup(
    <FactionPreview campaignId="campaign-1" places={[]} faction={{ id: "faction-1", author_id: "gm-1", name: "The Accord", description: "Independent brokers.", status: "active", place_id: null, art_subject: null, art_path: null, art_url: null, art_prompt: null, art_provider: null, color: "cyan" }} />,
  );

  expect(npcMarkup).toContain('href="/campaigns/campaign-1/npcs/npc-1"');
  expect(npcMarkup).toContain("Watch the airlock.");
  expect(factionMarkup).toContain('href="/campaigns/campaign-1/factions/faction-1"');
  expect(factionMarkup).toContain("Independent brokers.");
});
```

Use `renderToStaticMarkup` (not a browser-only renderer) for these preview contracts. The exact fixture names above must be used so the assertions exercise the record fields rather than only generic markup.

- [ ] **Step 2: Run the focused tests and verify the expected missing modules/props fail.**

Run: `npm test -- tests/ui.test.tsx tests/archive-previews.test.tsx`

Expected: FAIL because the cards still render links and the two preview components do not exist.

- [ ] **Step 3: Implement NPC and Faction list shells and previews.**

In each route view, derive normalized search results from the initial collection. NPC search includes `name`, `species`, `role`, and `getPlaceBreadcrumb(places, npc.place_id)`. Faction search includes `name`, `status`, and its Place breadcrumb. Render a shared `ArchiveMasterDetail` with the existing record count/action and domain-specific selector heading/icon. Preserve role-aware empty collection messages.

On create, prepend the saved record, set its ID as selected, and close the editor. Keep the existing editor inputs and art flow unchanged. A selected record remains selected if search hides its row. Use `NpcPreview` and `FactionPreview` for the right panel; each shows artwork/fallback, identity metadata, location, description, role-visible note excerpt where applicable, and one `OPEN FULL RECORD` link.

Convert `NpcCard` and `FactionCard` to selection buttons. Preserve their current visual treatments, status pills, artwork, responsive wrapping, and accessible names, while adding a complete selected-state class map. Remove list-row navigation links; canonical paths exist only in previews and full records.

- [ ] **Step 4: Run the focused NPC/Faction tests and typecheck the touched components.**

Run: `npm test -- tests/ui.test.tsx tests/archive-previews.test.tsx tests/archive-detail-ui.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no new errors from the changed route props or client components.

### Task 5: Standardize full records and render related sections

**Files:**
- Modify: `components/places/PlacePublicRecord.tsx`
- Modify: `components/places/PlaceDetailRouteView.tsx`
- Modify: `components/npcs/NpcPublicRecord.tsx`
- Modify: `components/npcs/NpcDetailRouteView.tsx`
- Modify: `components/factions/FactionPublicRecord.tsx`
- Modify: `components/factions/FactionDetailRouteView.tsx`
- Modify: `tests/art-detail-download.test.tsx`
- Create: `tests/archive-records.test.tsx`

**Interfaces:**
- `PlacePublicRecord` accepts `related: PlaceRelatedRecords` and continues to accept `campaignId`, `place`, `places`, `isGM`, and optional actions.
- `NpcPublicRecord` accepts `isGM`, `related: NpcRelatedRecords`, and optional heading actions in addition to its current `campaignId`, `npc`, and `places` props.
- `FactionPublicRecord` accepts `related: FactionRelatedRecords` and optional heading actions in addition to its current props.
- Each detail route view keeps mutation state local, passes `initialResult.related` into its public record, and passes `initialPlaces` from the route page.

- [ ] **Step 1: Write failing full-record tests for shared framing, private notes, and related links.**

Create `tests/archive-records.test.tsx` with complete fixtures and static assertions:

```tsx
it("renders Place relations and GM-only notes in the shared record frame", () => {
  const markup = renderToStaticMarkup(
    <PlacePublicRecord
      campaignId="campaign-1"
      isGM
      place={placeFixture}
      places={[parentPlaceFixture, placeFixture, childPlaceFixture]}
      related={{
        parent: { id: "parent-1", name: "Asterion", kind: "planet" },
        children: [{ id: "child-1", name: "Gate", kind: "checkpoint" }],
        npcs: [{ id: "npc-1", name: "Rook", species: "Android", role: "Contact" }],
        factions: [{ id: "faction-1", name: "The Accord", status: "active" }],
        jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
        episodes: [{ id: "episode-1", title: "Signal Lost", status: "active" }],
      }}
    />,
  );

  expect(markup).toContain('data-archive-record="true"');
  expect(markup).toContain('data-place-detail-panel="true"');
  expect(markup).toContain("The door is trapped.");
  expect(markup).toContain("Gate");
  expect(markup).toContain('href="/campaigns/campaign-1/npcs/npc-1"');
  expect(markup).toContain('href="/campaigns/campaign-1/jobs/job-1"');
  expect(markup).toContain('href="/campaigns/campaign-1/episodes/episode-1"');
});

it("keeps NPC GM notes out of player full records and renders giver jobs", () => {
  const markup = renderToStaticMarkup(
    <NpcPublicRecord
      campaignId="campaign-1"
      isGM={false}
      places={[placeFixture]}
      npc={{ ...npcFixture, gm_notes_markdown: "Hidden NPC context." }}
      related={{ place: { id: "place-1", name: "North Station", kind: "station" }, jobs: [{ id: "job-1", title: "The Relay", status: "open" }] }}
    />,
  );

  expect(markup).not.toContain("Hidden NPC context.");
  expect(markup).toContain("The Relay");
  expect(markup).toContain('href="/campaigns/campaign-1/jobs/job-1"');
});
```

Add a Faction assertion for status, primary Place, giver Jobs, and the absence of a notes section. Update the artwork-download fixtures to provide the new required `related` props and assert the existing download labels remain unchanged.

- [ ] **Step 2: Run the focused full-record tests and verify they fail for the new required props/sections.**

Run: `npm test -- tests/archive-records.test.tsx tests/art-detail-download.test.tsx`

Expected: FAIL because the public records do not yet accept related data or render through the new shared record shell.

- [ ] **Step 3: Implement shared full-record rendering and route integration.**

Refactor `PlacePublicRecord` to render its current content through `ArchiveRecordShell`, passing `panelDataAttribute="data-place-detail-panel"` and `contentDataAttribute="data-place-detail"` so current browser hooks survive. Keep Place art, breadcrumb, public brief, player notes, GM notes, and heading edit/add-child actions. Add related lists for parent/children, NPCs, Factions, Jobs, and Episodes; every item must use the existing campaign section/entity path helper.

Refactor `NpcPublicRecord` and `FactionPublicRecord` to the same shell. NPC full records must include portrait/art, species, role, primary Place link, description, player notes, GM-only notes for GMs, and giver Jobs. Faction full records must include emblem/art, status, primary Place link, description, and giver Jobs, with no invented notes section. Keep `ArtDownloadButton` behavior and existing domain fallback copy.

Update detail route views to pass `initialPlaces` from their page, hold any updated primary record in state, preserve existing edit/delete pending/error controls, and pass the corresponding `related` object. When an editor changes a Place relationship, derive the displayed primary breadcrumb from the current record plus the initial Place collection; do not turn client selection state into an authorization input. When a Place is edited, keep parent/child related links consistent with the local `places` state.

- [ ] **Step 4: Run the focused full-record and existing art tests.**

Run: `npm test -- tests/archive-records.test.tsx tests/art-detail-download.test.tsx tests/places-server.test.ts tests/npc-faction-server.test.ts`

Expected: PASS. Confirm no existing download, GM-action, private-note, or Place data-hook assertion regresses.

### Task 6: Add browser coverage for preview workflows and responsive behavior

**Files:**
- Create: `tests/e2e/archive-records.spec.ts`

**Interfaces:**
- Browser selectors use stable `data-archive-master-detail`, `data-archive-preview-panel`, `data-archive-preview-heading`, `data-place-preview`, `data-npc-preview`, and `data-faction-preview` hooks plus accessible selection-button names.
- The test uses the existing `campaign` fixture and deterministic GM/player storage states from `tests/e2e/fixtures.ts` and `playwright/.auth/player.json`.

- [ ] **Step 1: Write browser tests before changing browser-facing behavior further.**

Create one Playwright test that creates a unique Place, NPC, and Faction through the existing campaign APIs, then verifies all three list pages:

```ts
await page.goto(`/campaigns/${campaign.campaignId}/npcs`);
const sectionUrl = page.url();
await page.getByRole("button", { name: `Select ${npcName}`, exact: true }).click();
await expect(page).toHaveURL(sectionUrl);
await expect(page.locator("[data-npc-preview]")).toContainText(npcName);
await page.locator("[data-npc-preview]").getByRole("link", { name: "OPEN FULL RECORD", exact: true }).click();
await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}/npcs/[^/]+$`));
await expect(page.getByRole("heading", { name: npcName, exact: true })).toBeVisible();
```

Repeat the selection/no-navigation/full-record assertions for Place and Faction. Use `try/finally` cleanup to delete the NPC and Faction before the Place, and fail the test if any create response is not successful or any created ID is missing.

Add a mobile test at 390x844 that selects a record from each selector and asserts the matching `[data-archive-preview-heading]` is focused. Assert `document.documentElement.scrollWidth` is no greater than `window.innerWidth` after each selection. Add a player-context test that loads the NPC and Place full routes and asserts the GM note text is absent while public notes remain visible.

- [ ] **Step 2: Run the focused Playwright file and verify failures identify missing preview behavior.**

Run: `npm run test:e2e -- tests/e2e/archive-records.spec.ts`

Expected: FAIL only where the new selector hooks, previews, or full-record related sections are not implemented. If setup or loopback authentication fails, resolve that test-environment issue before changing feature code.

- [ ] **Step 3: Make the browser contract pass without weakening existing route guards.**

Ensure selection buttons do not call `router.push`, preview links use `campaignEntityPath`, mobile focus/reveal runs only after a non-null selection, and full-record links continue through the existing dirty-form navigation guard. Keep direct route load, back navigation, player access, and GM mutation controls unchanged.

- [ ] **Step 4: Run the focused browser file again.**

Run: `npm run test:e2e -- tests/e2e/archive-records.spec.ts`

Expected: PASS for Place, NPC, Faction, mobile focus/no-overflow, canonical full-record, and privacy scenarios.

### Task 7: Run the repository validation gate

**Files:**
- Review: all files changed by Tasks 1-6
- Test: all existing and new Vitest/Playwright suites

- [ ] **Step 1: Run the focused unit and server tests one final time.**

Run: `npm test -- tests/archive-detail-ui.test.tsx tests/archive-previews.test.tsx tests/archive-records.test.tsx tests/places-server.test.ts tests/npc-faction-server.test.ts tests/art-detail-download.test.tsx tests/ui.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the full Vitest suite.**

Run: `npm test`

Expected: all current and new tests pass; no generated output is discovered.

- [ ] **Step 3: Run typecheck, lint, and both production build paths.**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
npm run build -- --webpack
```

Expected: PASS with no new lint errors, preserving only the repository's known warnings/deprecation notice.

- [ ] **Step 4: Run the full browser suite.**

Run: `npm run test:e2e`

Expected: existing campaign shell/history/dirty-form tests and the new archive workflow tests pass.

- [ ] **Step 5: Check the final diff and generated-file boundaries.**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only the intended spec, plan, source, and test files are changed; no generated output or hosted configuration is modified.