# Campaign Frontend Refactor Continuation Plan

> **For agentic workers:** Use this document as the continuation ledger. Read `AGENTS.md`, `README.md`, and the baseline plan before changing code. Preserve the intentionally dirty worktree; do not reset, revert user changes, commit, or create branches unless the user explicitly requests it.

**Goal:** Finish the campaign frontend refactor by making the App Router and campaign layout the sole navigation/shell owners, removing the legacy cockpit controller, extracting repeated UI boundaries, and replacing feature styling in `app/globals.css` with Tailwind utilities while preserving behavior and visual language.

**Architecture:** Campaign pages are server-owned route boundaries under `/campaigns/[campaignId]`; client components own local mutations and editor state. `CampaignLayout` authenticates and resolves campaign membership once, `CampaignRouteShell` owns persistent navigation, and each route renders only its feature content. API handlers and Supabase RLS remain authoritative for permissions and persistence.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, Supabase SSR/RLS, Vitest, Playwright, Lucide.

**Spec:** Baseline decisions and the complete route map are recorded in [2026-08-21-routed-tailwind-frontend-refactor.md](2026-08-21-routed-tailwind-frontend-refactor.md).

## Global Constraints

- Use canonical campaign URLs from `lib/campaign/routes.ts`; do not add new `/?campaignId=...` links.
- Preserve direct loading, refresh, back/forward navigation, role checks, empty states, API contracts, Supabase RLS, and the synthwave terminal visual language.
- Keep list and detail pages as the route boundaries. Keep create/edit forms in those pages; do not add `/new` or `/edit` routes.
- Keep `CampaignRouteLink` as the navigation boundary so dirty-form confirmation remains centralized.
- Mount `DirtyFormProvider` at `app/campaigns/[campaignId]/layout.tsx`; feature editors must call `setDirty()` and `clearDirty()` when they become dirty, save, cancel, or reset.
- Do not add migrations, push hosted migrations, change auth provider configuration, or refactor unrelated APIs.
- Do not add `tailwind.config.*`, a Tailwind content array, legacy `@tailwind` directives, or a second styling system.
- Retain `middleware.ts` and the Netlify `.next-deploy`/webpack compatibility workaround until a separately verified deployment change replaces them.
- Read the relevant Next 16 documentation under `node_modules/next/dist/docs/` before changing route or middleware behavior.
- Do not remove old code until `rg`/code usage checks show it is no longer imported and the focused route tests pass.

## Current Checkpoint

### Verified complete

- Campaign list/create and invite flows exist at `/campaigns` and `/join/[token]`.
- Campaign-scoped routes exist for overview, jobs, characters, NPCs, factions, places, episodes, notes, members, and settings, including entity detail routes where applicable.
- Server campaign authentication and membership gating live in `app/campaigns/[campaignId]/layout.tsx` through `getCampaignRouteAccess`.
- `DirtyFormProvider` is mounted by the campaign layout.
- Canonical builders and active-section parsing live in `lib/campaign/routes.ts`.
- `CampaignRouteLink` wraps Next `Link` and confirms navigation when the dirty-form context is active.
- `CampaignRouteShell` renders persistent navigation for the overview root and every feature route, deriving its active section from `usePathname()`.
- Sidebar and overview shortcut links use canonical route anchors.
- Deterministic loopback Playwright setup provisions/reuses a local GM campaign, signs in through the real login form, and writes ignored storage state under `playwright/.auth/`.
- The first authenticated browser journey verifies campaign deep-link loading, refresh persistence, and exactly one `.app-shell`, `.sidebar`, and `.topbar`; the setup and journey pass locally.
- The initial `CampaignCockpit` null render crash is fixed: campaign-dependent navigation mapping runs after the loading/error guards. Regression coverage is in `tests/campaign-cockpit.test.tsx`.
- Full validation at this checkpoint: 181 tests passed, 6 skipped; typecheck passed; production build passed; lint had 0 errors and 29 existing warnings; `git diff --check` passed.

### Historical remaining work (superseded by the current handoff)

- The overview route now receives its campaign records from a server-owned `getCampaignOverview` read and the focused client component owns only vote synchronization and toast state.
- Authenticated browser coverage now covers the overview shell and direct route loading; back/forward, permission, dirty-form, and mobile journeys remain.
- Feature forms do not consistently register dirty state with `DirtyFormProvider`.
- Repeated metrics, record cards, empty states, form fields, and editor action rows remain embedded in large feature components.
- `app/globals.css` still contains most layout, panel, form, archive, and feature selectors despite Tailwind 4 being configured.
- README text and any remaining compatibility redirects must be checked for stale root-SPA assumptions.
- Authenticated Playwright coverage for direct route loading and refresh is established; navigation history, permission visibility, dirty-form prompts, and mobile navigation remain incomplete.

## Fresh-Context Startup

1. Read `AGENTS.md`, `README.md`, this plan, and `2026-08-21-routed-tailwind-frontend-refactor.md`.
2. Read the repository handoff memory at `/memories/repo/star-board-handoff.md` when memory access is available.
3. Run `git status --short` and preserve all existing modifications and untracked route files.
4. Run the baseline commands below before changing code. Record any new failure separately from the known lint warnings.

```powershell
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

5. Start with Task 1. Do not reopen the already-completed route builder, sidebar-link, or null-render fixes unless a new test falsifies them.

## Implementation Tasks

### Task 1: Make the campaign layout the sole shell owner

**Files:**
- Modify: `components/campaign-shell/CampaignRouteShell.tsx`
- Modify: `components/campaign-cockpit/CampaignCockpit.tsx`
- Modify: `app/campaigns/[campaignId]/page.tsx` only if the overview component name or props change
- Test: `tests/campaign-cockpit.test.tsx`, `tests/campaign-sidebar.test.tsx`, and a focused Playwright route test under `tests/e2e/`

**Interfaces:**
- `CampaignRouteShell` continues to consume `{ campaignId, campaignName, displayName, isGM, children }`.
- `CampaignRouteShell` must render `CampaignShell`, `CampaignSidebar`, and `CampaignTopbar` for the overview root as well as every feature route.
- `CampaignCockpit` should return overview content and its toast host, not a second shell, sidebar, or topbar.

- [x] **Step 1: Add a failing Playwright shell-ownership check.** In the local authenticated journey described by `tests/e2e/README.md`, load `/campaigns/[campaignId]` and assert that the page has exactly one `.sidebar`, one `.topbar`, and one `.app-shell`. Keep the existing initial loading assertion in `tests/campaign-cockpit.test.tsx`.
- [x] **Step 2: Run the focused test and confirm it fails against the current nested-shell exception.**

```powershell
npm test -- tests/campaign-cockpit.test.tsx tests/campaign-sidebar.test.tsx
```

- [x] **Step 3: Remove the overview bypass from `CampaignRouteShell`.** Delete the pathname check that returns `children` for `campaignPath(campaignId)`; allow the same shell path to wrap the overview and all feature routes.
- [x] **Step 4: Change the successful `CampaignCockpit` render to return only the overview content and `CampaignToastHost`.** Remove its `CampaignShell`, `CampaignSidebar`, and `CampaignTopbar` wrapper from the returned JSX. Preserve overview rendering and voting; route loading, auth, and error states remain at their App Router boundaries.
- [x] **Step 5: Remove shell-only derived values from `CampaignCockpit`.** Delete `displayedNavItems`, `activeLabel`, and any sidebar-only props that are no longer consumed by the overview return. Keep data required by the overview metrics and snapshot links.
- [x] **Step 6: Run the focused tests, typecheck, and production build.** Confirm there is one shell on the overview and no regression in the initial loading guard.

```powershell
npm test -- tests/campaign-cockpit.test.tsx tests/campaign-sidebar.test.tsx tests/campaign-routes.test.ts
npm run typecheck
npm run build
```

### Task 2: Retire the legacy SPA controller branches

**Files:**
- Modify: `components/campaign-cockpit/CampaignCockpit.tsx`
- Modify: `components/campaign-shell/CampaignRouteShell.tsx` only when removing obsolete navigation inputs
- Review usages: `components/characters/`, `components/npcs/`, `components/factions/`, `components/places/`, `components/jobs/`, `components/episodes/`, `components/notes/`, `components/members/`, `components/settings/`
- Review usages: `components/archive/`
- Test: existing `tests/*-server.test.ts`, route tests, and new focused cockpit tests

**Interfaces:**
- Each feature route remains responsible for its own server read and client mutation component.
- `CampaignCockpit` owns only overview data and overview actions after this task; it must not select feature views through `activeView`.
- `campaignNavigation` in `lib/campaign/navigation.ts` remains metadata for the persistent shell, not a view registry.

- [x] **Step 1: Inventory every symbol still exported or imported from `CampaignCockpit`.** Use `rg` for `CampaignCockpit`, `OverviewView`, `JobsView`, `CharactersView`, `NpcsView`, `FactionsView`, `PlacesView`, `EpisodesView`, `CampaignNotesView`, `MembersView`, and `CampaignSettingsView`. Record only live consumers before deletion.
- **Optional follow-up not added:** The controller no longer has feature-view branches, so a separate regression for selecting a non-overview view would duplicate the source contract rather than protect a live behavior.
- [x] **Step 3: Remove `activeView`, old SPA view branches, and their dead handler/state dependencies from `CampaignCockpit` one feature group at a time.** Keep the overview fetches required by the dashboard until Task 3 decides whether they move to server reads.
- [x] **Step 4: Remove unused icon imports, archive imports, and navigation constants revealed by the deletion.** Do not clean unrelated warnings in other files.
- [x] **Step 5: Run feature route tests and typecheck after each deletion group.** A deletion group is complete only when the corresponding routed page still builds and its focused test passes.

```powershell
npm test -- tests/campaign-cockpit.test.tsx tests/character-server.test.ts tests/npc-faction-server.test.ts tests/places-server.test.ts tests/jobs-server.test.ts tests/episodes-server.test.ts tests/notes-server.test.ts tests/members-server.test.ts tests/settings-server.test.ts
npm run typecheck
```

### Task 3: Align overview and feature data ownership with the App Router

**Files:**
- Review and modify: `app/campaigns/[campaignId]/page.tsx`
- Review and modify: `app/campaigns/[campaignId]/*/page.tsx`
- Modify or create: `lib/campaign/server.ts` and focused server mappers only when a route needs a shared authenticated read
- Modify: `components/campaign-cockpit/CampaignCockpit.tsx` or replace it with a focused overview client component
- Test: `tests/campaign-server.test.ts`, route-specific server tests, and `tests/e2e/`

**Interfaces:**
- Server pages receive `params: Promise<{ campaignId: string }>` and resolve access through the existing campaign server helper.
- Client views receive server-provided records and campaign IDs, then call APIs only for mutations and refreshes.
- Loading, `notFound()`, and auth redirects remain route-boundary behavior; a client view must not recreate the campaign membership gate.

- [x] **Step 1: Map the overview data contract.** List the exact dashboard values currently derived from jobs, members, notes, episodes, characters, NPCs, factions, and places. Identify which values can be supplied by a server page without changing the API response shape.
- [x] **Step 2: Add a focused server contract test for the chosen overview read boundary.** Verify campaign scoping and role/display-name behavior through the existing `getCampaignRouteAccess` pattern; keep database and RLS behavior unchanged.
- [x] **Step 3: Move only the reads that are safe and useful to the server page.** Do not move mutation handlers, vote synchronization, AI calls, or art upload logic into server components.
- [x] **Step 4: Keep the overview client component responsible for vote state, toast state, and optimistic refresh.** Pass it typed data instead of making it discover campaign identity from `window.location`.
- [x] **Step 5: Verify direct URL, refresh, and unauthorized behavior for overview and one representative detail route.** Use Playwright with the local authenticated fixture when available.

```powershell
npm test -- tests/campaign-server.test.ts tests/campaign-cockpit.test.tsx
npm run typecheck
npm run build
```

### Task 4: Extract shared UI and editor boundaries

**Files:**
- Create: `components/ui/EmptyState.tsx`
- Create: `components/ui/MetricCard.tsx`
- Create: `components/ui/FormField.tsx` and `components/ui/FormActions.tsx` only after confirming the shared prop contract across at least three editors
- Create or modify: `components/jobs/MissionCard.tsx` for the domain-specific mission card
- Modify: `components/characters/`, `components/npcs/`, `components/factions/`, `components/places/`, `components/jobs/`, `components/notes/`, `components/members/`, `components/settings/`
- Modify: `components/campaign-shell/DirtyFormProvider.tsx` only if the provider API needs a tested reset boundary
- Test: focused component tests beside the existing sidebar and route tests

**Interfaces:**
- `EmptyState` accepts a title, message, icon, and optional action node; it replaces repeated empty collection markup without owning data fetching.
- `MetricCard` accepts `label`, `value`, `detail`, `icon`, and an existing accent token; preserve the current overview visual output.
- `FormActions` accepts submit/cancel/delete action nodes and does not know about API routes.
- Editors call `useDirtyForm()` and clear the dirty state after successful save, cancel, or explicit reset.

- [x] **Step 1: Extract `MetricCard` from `CampaignCockpit` without changing markup or CSS classes.** Add a render regression that checks its label, value, and detail output.
- [x] **Step 2: Extract the repeated empty collection state into `EmptyState`.** Migrate one route at a time and remove the old inline markup only after the route test passes.
- [x] **Step 3: Extract the mission card into `components/jobs/MissionCard.tsx`.** Preserve vote, edit, promote, artwork, and status behavior; do not move API calls into the card. The existing `JobCard` already owned this domain boundary, so the overview now reuses it and gains canonical detail links without adding a duplicate component.
- [x] **Step 4: Compare editor field/action markup across characters, NPCs, factions, places, jobs, notes, members, and settings.** Create `FormField` or `FormActions` only for props that are identical in three or more editors. The editor fields and action rows differ enough that no shared field/action component was introduced.
- [x] **Step 5: Wire dirty state into the migrated editors.** Use the existing provider methods, clear after successful mutation and cancel, and keep `CampaignRouteLink` as the only route-navigation guard. Character, NPC, faction, place, job, and note editors now register draft changes and clear after save, delete, or cancel; browser coverage exercises character, job, place, and note navigation.
- [x] **Step 6: Run the affected route tests and a focused lint pass.** Do not broaden this task into a visual redesign.

```powershell
npm test -- tests/campaign-sidebar.test.tsx tests/campaign-cockpit.test.tsx tests/character-actions.test.ts tests/job-action-route.test.ts
npx eslint "components/ui" "components/characters" "components/npcs" "components/factions" "components/places" "components/jobs" "components/notes" "components/members" "components/settings"
```

### Task 5: Migrate feature styling from `globals.css` to Tailwind

**Files:**
- Modify: `app/globals.css`
- Modify: `components/campaign-shell/`, `components/ui/`, and the feature component folders as each selector is migrated
- Review: `app/layout.tsx` and existing Tailwind import/theme tokens
- Test: Playwright responsive smoke tests under `tests/e2e/`

**Interfaces:**
- Keep only document-level tokens, font declarations, reset/focus rules, unavoidable keyframes, and the campaign visual tokens in `app/globals.css`.
- Component layout, spacing, borders, colors, responsive breakpoints, and state styling should live in Tailwind class names or a small component-local stylesheet only when a selector cannot be expressed clearly with Tailwind.
- Keep the current CSS variable names where they are used as the visual design tokens; expose them through the existing Tailwind 4 `@theme inline` block.

- [x] **Step 1: Inventory selectors and usage before deleting CSS.** Run `rg` for each class in `app/globals.css`; group selectors into shell, shared UI, forms, archive, dashboard, and feature-specific buckets. The shell inventory confirmed ownership in `CampaignShell`, `CampaignRouteShell`, `CampaignSidebar`, and `CampaignTopbar` before the first migration edits.
- [x] **Step 2: Migrate the shell bucket.** Convert `.app-shell`, `.app-content`, `.sidebar`, `.side-nav`, `.topbar`, `.content-frame`, and their responsive states in the shell components. Preserve the grid overlay and mobile navigation behavior.

	Progress checkpoint: outer frame, content surface, sidebar desktop structure, navigation growth, topbar structure, responsive content spacing, and the mobile drawer state now use Tailwind utilities. The focused shell journey covers direct load, refresh, one-shell ownership, and mobile drawer open/close at 390px; the migrated drawer no longer depends on the global `.sidebar` or `.sidebar-open` state selectors.
- [x] **Step 3: Migrate shared UI and form buckets.** Convert panels, buttons, fields, headings, empty states, metric cards, and editor action rows using the extracted components from Task 4.

	Progress checkpoint: `MetricCard`, `EmptyState`, `StatusPill`, `VisualAsset`, `RecordPortrait`, `PageLayout`, `SectionHeading`, and `AppStatus` now carry their shared base layout utilities. Campaign overview and routed Places headings own the panel-topline layout, all live editor headings/action clusters own their flex, spacing, wrapping, typography, and 420px behavior, all text actions own their inline-flex, typography, cursor, hover, and 420px form-action utilities, forms/action rows own their base layout, responsive grid placement, and sub-760px action wrapping utilities, all icon-button owners carry their dimensions, layout, base, and hover utilities, and all shared button owners carry their base plus primary, secondary, danger, and AI variant utilities. The `character-empty`, AppStatus, mobile drawer, panel-topline, editor heading, editor h2 typography, editor heading action media, text-action, form, form-grid, form-action, action-wrap, 420px text-action, shared character-form control, field-lock, form-error, icon-button, button base, button-secondary, button-primary, button-danger, and button-ai declarations have been removed from globals; feature-specific button sizing/placement and decorative declarations remain until their owning route checks support removing them.
- [x] **Step 4: Migrate feature-specific buckets one route at a time.** Delete a selector only after `rg` reports no live usage and the corresponding route renders in the responsive smoke test.
- [x] **Step 5: Keep justified global rules.** Retain `:root`, `@theme inline`, body typography/background, box sizing, focus-visible behavior, and complex global visual effects that cannot be represented more clearly in component markup.
- [x] **Step 6: Run desktop and mobile Playwright checks plus the production build.** Check that text, controls, sidebar states, cards, and forms do not overlap or resize unexpectedly.

```powershell
npm run test:e2e -- --grep "campaign|responsive|navigation"
npm run typecheck
npm run build
```

Progress checkpoint (2026-08-21): dead character/faction selectors and the unused mission ETA selector are removed. Job vote default, active, hover, and responsive states now use route-owned utilities, as do the mission artwork frame/overlay, mission index, giver glyph, card/content/meta/footer structure, jobs-grid and compact layout, responsive card sizing, and GM action positioning; the focused job vote Playwright contract passes. The public character detail responsive rule was restored after audit, and its mobile Playwright contract now verifies the single-column layout, compact spacing, centered portrait, and smaller heading. Faction card framing and the responsive faction collection grid now use route-owned utilities, and the focused faction browser contract passes. Character archive card framing, interaction states, overlay, copy typography, and responsive collection grid now use route-owned utilities, and the focused character browser contract passes. The public faction detail heading now uses route-owned flex utilities, and the focused faction browser contract still passes after removing its legacy selector. The NPC public detail preview, portrait frame, copy column, notes row, 760px collapse, and list-row interaction states now use route-owned utilities, and the focused NPC list/detail contract passes. Routed NoteCard row geometry, accent variants, metadata, visibility treatment, and typography now use route-owned utilities; Notes and Jobs filter toolbars, tabs, active states, and the Notes GM visibility toggle also use route-owned utilities, and the focused Notes and Jobs browser contracts pass after removing their legacy selectors. EpisodeCard row geometry, active background, number block, responsive alignment, summary, and open action now use route-owned utilities, and the focused EpisodeCard contract passes after removing its legacy selectors. MemberCard row geometry, copy typography, status spacing, joined-date visibility, responsive padding, and current-member marker now use route-owned utilities; the Members summary/clearance surface, collection container, and conditional join-link card also use route-owned responsive utilities, and the focused MemberCard, MembersRouteView, and authenticated join-link contracts pass after removing all audited member selectors from global CSS. The mission-specific global CSS audit is clean; remaining Task 5 work is in other feature styling buckets.

### Task 6: Remove compatibility assumptions and finish route-native navigation

**Files:**
- Review and modify: `app/page.tsx`
- Review and modify: `app/campaigns/page.tsx`
- Review and modify: `components/campaign-cockpit/CampaignCockpit.tsx`
- Review and modify: `lib/campaign/routes.ts`
- Modify: `README.md`
- Test: `tests/campaign-routes.test.ts`, route tests, and `tests/e2e/`

**Interfaces:**
- `/campaigns` is the authenticated campaign manifest and the only campaign selector destination.
- `/campaigns/[campaignId]` and its child routes are the canonical campaign destinations.
- `legacyCampaignPath()` may remain only while an explicit compatibility redirect is still needed; no new caller may use it for internal navigation.

- [x] **Step 1: Search for legacy navigation and internal location assignments.** Run `rg` for `legacyCampaignPath`, `campaignId=`, `window.location`, `activeView`, `onSelect`, and `selectView`. Classify each match as compatibility, auth redirect, mutation result, or obsolete SPA behavior.
- [x] **Step 2: Replace obsolete internal navigation with `CampaignRouteLink`, `redirect()`, or `useRouter().push()` according to server/client ownership.** Preserve external redirects and auth callback behavior.
- [x] **Step 3: Update README route examples and local development instructions to use `/campaigns/[campaignId]`.** Keep compatibility behavior documented only if it still exists in code.
- [x] **Step 4: Add direct-link and back/forward coverage for one list route, one detail route, and Settings role filtering.** Assert the sidebar remains visible and the active item follows the pathname.
- [x] **Step 5: Remove `legacyCampaignPath` only after the usage search and compatibility test show no caller remains.**

```powershell
npm test -- tests/campaign-routes.test.ts tests/campaign-server.test.ts tests/campaign-sidebar.test.tsx
npm run test:e2e -- --grep "direct|back|forward|settings|navigation"
npm run typecheck
```

### Task 7: Final cleanup and verification gate

**Files:**
- Review all files changed by Tasks 1-6
- Update: `README.md` and this continuation plan with the verified final state
- Test: full repository test, lint, build, and Playwright suites

- [x] **Step 1: Run a usage search for obsolete cockpit and archive symbols.** Confirm no live imports remain before deleting files; retain any archive component still used by a routed feature.
- [x] **Step 2: Remove only verified-dead files, CSS selectors, imports, and compatibility branches.** Do not remove unrelated user changes from the dirty worktree.
- [x] **Step 3: Run the complete validation gate.**

```powershell
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
npm run build -- --webpack
git diff --check
```

- [x] **Step 4: If local Supabase is running, run the opt-in RLS suite.** It must target loopback only and must not push hosted migrations.

```powershell
$env:RUN_LOCAL_SUPABASE_TESTS = "1"
npm run test:rls
```

- [x] **Step 5: Record the final test counts, remaining warnings, browser coverage, and any intentionally retained compatibility code in this document and the repository handoff memory.**

## Definition Of Done

The refactor is ready for review when all of the following are true:

- Every campaign page uses the canonical App Router URL and direct refresh works.
- `CampaignLayout` owns exactly one persistent shell for overview, list, and detail routes.
- `CampaignCockpit` is no longer a view switcher or second shell; it owns only the overview behavior that remains necessary.
- Sidebar active state comes from the pathname, and players cannot see or reach GM-only Settings through campaign navigation.
- Dirty editor changes trigger the existing navigation confirmation and successful saves/cancels clear the dirty state.
- Shared metrics, mission cards, empty states, and repeated editor controls have focused component boundaries with no behavior loss.
- `app/globals.css` contains only justified global tokens/base rules/effects; feature layout and state styling is expressed through Tailwind/component markup.
- Full Vitest, Playwright, typecheck, lint, normal build, webpack build, and `git diff --check` results are recorded. Local RLS validation is recorded when the loopback stack is available.

## Current Handoff (2026-08-22)

The campaign frontend refactor is complete in the local worktree. The App Router and campaign layout own canonical navigation and the persistent shell, feature components own their presentation through Tailwind utilities, and the final local validation gates are green. Persistence, auth, RLS, API contracts, and the retained root compatibility redirect were not weakened.

### Completed in the latest continuation

- Replaced campaign-selector and invite-success query-string navigations with `useRouter().push(campaignPath(...))`; retained the root `/?campaignId=...` redirect solely for legacy entry points.
- Added deterministic loopback E2E provisioning for both a GM and a player, including real login sessions and idempotent player membership through the existing join-link/RPC contract.
- Added browser coverage for canonical selector and invite destinations, character list/detail back-forward history, active sidebar state, mobile shell behavior, dirty-form navigation guards, and player omission/direct denial of GM-only Settings.
- Removed the verified-dead `components/archive/PlacesView.tsx` and migrated the remaining live presentation selectors out of `app/globals.css`; `components/ui/terminalStyles.ts` now owns the shared terminal utility class constants.
- Added `.next-playwright/**` to the ESLint global ignores so generated Playwright Next output is not linted as application source.
- Added the daily Netlify AI audit retention function and documented its production environment requirements and local invocation path.

### Operator follow-up status

- Hosted OpenRouter provider smoke testing passed from the configured server environment: live model discovery and a minimal structured JSON generation both succeeded without exposing the key or generated content. A hosted authenticated application flow remains optional because it would require creating disposable hosted account data.
- The 90-day AI audit retention window is implemented by `netlify/functions/ai-generation-retention.ts`, scheduled daily at `03:00 UTC`; it uses the existing Supabase secret-key helper and has a focused unit contract in `tests/ai-generation-retention.test.ts`.
- The linked Netlify workspace upload was attempted but exited with status 1 without a deploy ID; production remains on the prior ready deploy, so the schedule will activate after a successful published deploy.

### Latest verification

- `npm test`: 44 files passed, 211 tests passed; no skipped files or tests.
- `npm run test:e2e`: 24 tests passed, including the GM/player setup project.
- `npm run typecheck`, `npm run build`, `npm run build -- --webpack`, local RLS (6 tests), and `git diff --check`: passed.
- Live OpenRouter smoke: model discovery and minimal structured JSON generation passed using the configured server key; no credentials or generated content were printed.
- `npm run lint`: 0 errors and 8 existing warnings; generated `.next-playwright` output is excluded by `eslint.config.mjs`.
