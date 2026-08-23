# Archive Master-Detail Records Design

**Date:** 2026-08-22
**Status:** Approved in conversation; awaiting written-spec review

## Summary

Restore the earlier fast Place-selection interaction as a shared archive pattern for Places, NPCs, and Factions. Each section list keeps its canonical section URL while a selected record fills a right-hand summary panel. An explicit action opens the existing canonical entity URL, where a structurally consistent full record shows all campaign-facing fields and the related records supported by current database relationships.

The implementation preserves the recent App Router refactor: list previews are intentionally local UI state, while standalone detail routes remain refreshable, shareable, and browser-history-aware. No schema, RLS policy, or dependency change is required.

## Goals

- Restore in-page selection for the Places tree without replacing canonical Place detail routes.
- Give NPC and Faction lists the same two-column selector-and-preview structure as Places.
- Use one shared visual and responsive layout while retaining domain-specific selector rows, icons, metadata, and fields.
- Provide an explicit `OPEN FULL RECORD` path from every preview.
- Make the three standalone detail pages use the current Place record hierarchy.
- Show all campaign-facing fields on full records, including GM-only notes where the domain supports them.
- Show related records backed by existing Place and Job foreign keys.
- Preserve campaign membership checks, GM/player information boundaries, dirty-form guards, loading states, not-found behavior, and canonical URLs.

## Non-Goals

- Do not make a preview independently shareable or restore it after refresh.
- Do not put preview selections in browser history or a query string.
- Do not replace existing entity detail URLs.
- Do not add many-to-many relationships, new columns, migrations, or RLS policies.
- Do not expose record IDs, timestamps, author IDs, AI prompts, AI providers, or other system/provenance metadata.
- Do not add inline editing or deletion to summary previews.
- Do not redesign Jobs, Episodes, Characters, Notes, or other archive sections.

## Product Decisions

### Preview navigation

Selecting a Place, NPC, or Faction changes local state on its section page and does not change the URL. The selected row receives an active treatment, and the right panel swaps from its initial prompt to a useful summary. The summary contains one prominent `OPEN FULL RECORD` link to the canonical entity route.

The initial state does not select the first record. It prompts the user to choose one. Search filtering also does not silently change selection; if the selected record is filtered out, its preview remains until the user selects another record or clears the search.

### Preview depth

The preview is for rapid scanning, not exhaustive reading or mutation. It contains:

- artwork or domain fallback;
- name and domain identity metadata;
- Place hierarchy or primary Place where applicable;
- description;
- a clamped role-visible notes excerpt where the domain has notes;
- the canonical full-record action.

For GM users, a preview may include an explicit private-note excerpt for Places and NPCs, but private content must remain visually distinct and must never be rendered for players. Factions currently have no player-note or GM-note fields, so their preview does not invent a notes section.

### Full-record depth

Standalone detail pages contain all campaign-facing data currently stored for the domain:

- **Place:** art, name, kind, full hierarchy, description, player notes, GM-only notes, parent and child Places, and entities assigned to the Place.
- **NPC:** portrait, name, species, role, primary Place, description, player notes, GM-only notes, and Jobs for which the NPC is the giver.
- **Faction:** emblem or art, name, status, primary Place, description, and Jobs for which the Faction is the giver.

Empty fields use intentional record-specific copy rather than disappearing in a way that makes the record look incomplete. Empty related sections use concise empty messages.

## Interaction Design

### Shared desktop structure

All three section pages use the current Places proportions and panel treatment:

1. The toolbar contains record count, archive context, and search.
2. The left panel contains a domain-owned selector.
3. The right panel contains the initial prompt or selected preview.

Places retain the recursive hierarchy tree, expansion controls, breadcrumbs, and GM add-child controls. NPCs use compact contact rows suitable for fast vertical scanning. Factions use compact faction rows rather than their current three-column cards. NPC and Faction selectors must not imitate a tree because their data is flat.

Search matches the fields users use to identify records:

- Places: name, kind, and hierarchy breadcrumb.
- NPCs: name, species, role, and Place breadcrumb.
- Factions: name, status, and Place breadcrumb.

Each selector renders an explicit no-results state. Search input labels and placeholders remain domain-specific.

### Selection controls

Selector rows are buttons, not links, because their primary action is local selection. Each row exposes its selected state with `aria-pressed`, points to the preview with `aria-controls`, and has a stable visible focus treatment. Tree expansion and GM add-child buttons remain separate controls and do not trigger selection.

The preview's full-record action is a guarded Next.js link generated with `campaignEntityPath`. It remains the only navigation caused by the summary panel.

### Mobile behavior

At and below the existing 760 px breakpoint, the layout becomes one column and the preview remains above the selector, matching the current Places responsive order. After a user selects a row, the page scrolls the preview into view and moves programmatic focus to its heading. Smooth scrolling is used only when the user does not request reduced motion.

Desktop selection does not move focus away from the selected row, allowing quick keyboard traversal. Long names, breadcrumbs, statuses, descriptions, and note excerpts wrap or clamp without changing fixed control dimensions or causing horizontal page overflow.

### Creation and editor behavior

Existing GM creation and Place child-creation workflows remain in their current section views. Opening or changing a preview must not close an editor or clear its draft. After a successful create, the new record is inserted into the selector, becomes the selected preview, and the editor closes through its existing success path.

Mutation controls remain on standalone full records. Existing pending states, errors, confirmations, art cleanup, and post-delete return to the section URL are preserved.

## Component Architecture

### Shared archive browser shell

Create a reusable presentation component under `components/ui/` that owns only:

- the two-column responsive grid;
- selector and preview panel frames;
- the default prompt presentation;
- stable preview identity and focus target plumbing;
- optional mobile reveal behavior after selection.

The shell receives selector and preview content as React nodes. It must not contain domain unions, fetch data, derive search results, or own editor state. This keeps Place hierarchy behavior and NPC/Faction record behavior in their domain folders.

### Shared record shell

Create a second reusable presentation component under `components/ui/` based on the current Place detail structure. It provides slots for:

- navigation or preview action;
- eyebrow, title, metadata, and optional heading actions;
- artwork;
- description or public brief;
- role-visible note sections;
- related-record sections;
- optional GM mutation controls on standalone pages.

It owns visual hierarchy and responsive framing, not record semantics. Domain components choose labels, icons, field fallbacks, and which slots to render.

### Domain ownership

- `components/places/` owns the tree, hierarchy search, Place preview, Place full-record content, and Place editor integration.
- `components/npcs/` owns NPC search, compact rows, NPC preview, NPC full-record content, and NPC editor integration.
- `components/factions/` owns Faction search, compact rows, Faction preview, Faction full-record content, and Faction editor integration.
- Shared related-record presentation may live in `components/ui/` only if the same linked-summary treatment is reused by at least two domains.

The existing `PlacePublicRecord`, `NpcPublicRecord`, and `FactionPublicRecord` boundaries remain the domain renderers. They are adapted to the shared shell rather than replaced by one large union-based record component.

## Data Flow

### List pages

List-page previews do not fetch after selection. All preview fields come from the section's initial server result.

The NPC and Faction list and detail Server Component pages load Places in parallel with their own primary results and pass them into their route views. This replaces their current client-side `fetchCampaignPlaces` effect, prevents a location label from changing after first paint, supplies complete breadcrumbs, and gives their editors immediate Place options. Places already receive the complete Place collection needed for tree rendering, preview content, and breadcrumbs.

Each route view owns:

- collection state so successful creation can insert a record;
- search state;
- `selectedId: string | null`;
- existing editor state;
- Place expansion state where applicable.

The selected record is derived from the current collection rather than duplicated in state. If a mutation removes the selected record, selection returns to `null` and the prompt is restored.

### Full detail pages

Extend the three authenticated server helpers so each full-detail result includes a typed `related` object. Related summaries are queried in parallel after authentication and campaign membership are established. Parent, child, and primary Place summaries are derived from the already loaded campaign Place collection; they must not trigger duplicate Place queries. New related queries are therefore limited to assigned NPCs, Factions, Jobs, and Episodes for a Place and giver Jobs for an NPC or Faction.

The supported relationships are:

| Full record | Existing relationship | Related summaries |
| --- | --- | --- |
| Place | `places.parent_place_id` | Parent Place and direct child Places |
| Place | `npcs.place_id` | NPCs assigned to the Place |
| Place | `factions.place_id` | Factions assigned to the Place |
| Place | `jobs.place_id` | Jobs assigned to the Place |
| Place | `episodes.place_id` | Episodes assigned to the Place |
| NPC | `npcs.place_id` | Primary Place |
| NPC | `jobs.giver_npc_id` | Jobs given by the NPC |
| Faction | `factions.place_id` | Primary Place |
| Faction | `jobs.giver_faction_id` | Jobs given by the Faction |

Every related query is constrained by `campaign_id`, even where the foreign key already guarantees same-campaign integrity. It selects only the fields needed by the linked summary. The authenticated Supabase client and existing RLS policies remain the final authorization boundary.

Related summaries link through `campaignEntityPath` to existing canonical routes. Player responses rely on existing member-readable records and must omit GM-only Job fields such as `hook` and private notes. A related-query error throws a bounded server error and lets the route error boundary handle the failure; the page must not silently label an incomplete result as the complete record.

No API route changes are needed for initial page rendering. Existing mutation endpoints remain unchanged.

## Record Types

Add focused related-summary types in the owning server-helper modules or a small shared campaign detail type module if at least two helpers consume the exact same shape. Suggested public shapes are:

```ts
type RelatedPlaceSummary = {
  id: string;
  name: string;
  kind: string;
};

type RelatedNpcSummary = {
  id: string;
  name: string;
  species: string;
  role: string;
};

type RelatedFactionSummary = {
  id: string;
  name: string;
  status: string;
};

type RelatedJobSummary = {
  id: string;
  title: string;
  status: "draft" | "open" | "promoted" | "archived";
};

type RelatedEpisodeSummary = {
  id: string;
  title: string;
  status: "planned" | "active" | "complete" | "archived";
};
```

The detailed result types name their relationship groups explicitly instead of returning an untyped mixed array. This keeps renderer logic exhaustive and avoids runtime type discrimination for records that are already known by query origin.

## Authorization And Privacy

- All list and detail reads continue to require authenticated campaign membership.
- All mutations continue to require GM authorization on the server and through RLS.
- Place and NPC private notes are queried and rendered only for GMs.
- Factions do not gain a private-notes concept.
- Related records expose only campaign-facing summary fields.
- Client selection state never becomes an authorization input.
- Hidden controls do not replace server authorization.
- Signed campaign-art URLs retain their existing short lifetime and membership-scoped generation path.

## Loading, Empty, And Error States

- A non-empty section with no selection renders a domain-specific choose-record prompt.
- An empty collection renders the existing role-aware archive empty state instead of the two-panel browser.
- A search with no matches renders a no-results state inside the selector panel while preserving any existing preview.
- Full-record related sections render concise empty copy when their query succeeds with no records.
- Authentication, membership failure, or a missing primary record continues through the existing not-found behavior.
- Related-query failures are not converted to empty arrays.
- Existing route `loading.tsx` boundaries remain in place.
- Mutation errors remain near their controls and do not erase the currently rendered record.

## Testing Strategy

### Focused component tests

Add tests for all three route views and shared shells that verify:

- the initial prompt renders with no implicit selection;
- selecting a row swaps preview content without navigating;
- the selected row exposes `aria-pressed="true"` and `aria-controls`;
- the preview action targets the correct canonical entity URL;
- search matches the approved domain fields and renders a no-results state;
- filtering does not silently clear the current preview;
- a successfully created record becomes selected;
- player previews never contain Place or NPC GM notes;
- Faction preview and full record do not render invented notes sections.

### Server-helper tests

Extend the nearest campaign server tests to verify:

- every related query is campaign-scoped;
- Place detail groups parent, direct children, NPCs, Factions, Jobs, and Episodes correctly;
- NPC and Faction detail return primary Place and giver Jobs;
- empty relationships return correctly typed empty groups;
- players do not receive GM-only primary or related fields;
- a related-query failure rejects instead of silently returning an incomplete detail result.

### Route and full-record tests

Verify that:

- all three full records render through the shared record shell;
- domain-specific metadata and empty-field copy remain correct;
- Place and NPC GM notes render only for GMs;
- related summaries use canonical links;
- existing edit, delete, and Place add-child controls remain GM-only;
- direct entity routes and their not-found boundaries still work.

### Browser tests

Add Playwright coverage for:

- selecting and previewing one Place, NPC, and Faction without changing the section URL;
- opening each selected record through `OPEN FULL RECORD`;
- direct loading and browser-back behavior for each canonical detail route;
- player and GM note visibility;
- mobile selection scrolling to and focusing the preview heading;
- no horizontal overflow at mobile and desktop viewports.

### Validation order

Use the narrowest affected Vitest test first during implementation, then run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
git diff --check
```

The RLS suite and migration validation are unnecessary because this design changes neither schema nor policy behavior. If implementation later requires either, stop and revise this design before adding database work.

## Rollout Constraints

- Preserve the existing campaign shell and active navigation behavior.
- Preserve all current canonical section and entity paths.
- Preserve the dirty-form navigation guard for the explicit full-record link and all sidebar navigation.
- Keep Tailwind classes statically discoverable and use existing design tokens and record-style helpers.
- Use Lucide icons and accessible native controls.
- Do not add feature selectors to `app/globals.css`.
- Do not change hosted Supabase configuration or deploy as part of this feature.

## Acceptance Criteria

1. Places, NPCs, and Factions each render a responsive selector-and-preview list page using the same structural layout.
2. Record selection updates only local preview state and leaves the section URL unchanged.
3. Every preview has an explicit canonical full-record link.
4. Full records share the Place-derived visual hierarchy while retaining all domain-specific campaign-facing fields.
5. Place and NPC private notes remain GM-only in previews and full records.
6. Full records show all approved related records from existing foreign keys and no invented relationships.
7. Empty, loading, not-found, error, pending, and permission states remain explicit.
8. Keyboard selection, selected-state semantics, mobile focus transfer, reduced-motion behavior, and responsive wrapping are verified.
9. Existing creation, editing, deletion, art, hierarchy, authorization, and route-history behavior does not regress.
10. Focused tests and the repository validation commands pass.