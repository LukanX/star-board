# Routed Tailwind Frontend Refactor Implementation Plan

> **For agentic workers:** Use the execution ledger for this plan and implement task-by-task with review checkpoints.

**Goal:** Replace the campaign cockpit SPA with campaign-scoped Next.js App Router routes, feature-owned components, and Tailwind 4 styling while preserving visual behavior, permissions, APIs, and Netlify compatibility.

**Architecture:** Migrate in vertical feature slices. Establish shared campaign route/data contracts, Tailwind primitives, and a persistent campaign shell first; then add canonical list/detail routes under `/campaigns/[campaignId]`, move feature state/data ownership into those routes, and retire the root `activeView` controller last. Keep API handlers and Supabase RLS authoritative.

**Tech Stack:** Next.js 16.3.2 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase SSR, Vitest, Playwright.

**Spec:** Approved in-chat design from 2026-08-21; decisions are recorded below.

## Global Constraints

- Canonical URLs use stable database IDs, including entity detail routes.
- Preserve visual parity; this is not a visual redesign.
- Add focused Playwright coverage for real routing and lifecycle behavior.
- Warn before discarding dirty forms; do not persist drafts in browser storage.
- Keep create/edit interfaces on list/detail pages instead of adding `/new` and `/edit` routes.
- Keep APIs and Supabase RLS authoritative for mutation authorization.
- Retain `middleware.ts` and the Netlify webpack/`.next-deploy` workaround.
- Do not add database migrations, hosted migration pushes, auth-provider changes, or unrelated refactors.
- Tailwind 4 is already configured; do not add `tailwind.config.*`, a content array, or legacy `@tailwind` directives.

## Implementation Tasks

1. Establish a clean baseline, exclude generated `.next-deploy` output from static tooling, align `eslint-config-next`, and add focused Playwright infrastructure.
2. Add tested campaign route builders, navigation metadata, shared DTO/UI types, mappers, and request error handling.
3. Add Tailwind-based UI primitives and extract the campaign shell plus dirty-form navigation boundary.
4. Add `/campaigns/[campaignId]` server layout, overview route, loading/error/not-found boundaries, and compatibility redirects.
5. Migrate Characters, NPCs, Factions, Places, Jobs, Episodes, Notes, Members, and Settings as independently verified list/detail slices.
6. Convert remaining auth/campaign/AI/art surfaces and reduce `app/globals.css` to justified global rules.
7. Remove the SPA controller, all-collection bootstrap, obsolete archive components/styles, and old navigation.
8. Run Vitest, Playwright, typecheck, lint, normal and webpack builds, optional local RLS tests, responsive smoke checks, and final code review.

## Route Map

- `/campaigns`
- `/campaigns/[campaignId]`
- `/campaigns/[campaignId]/jobs` and `/jobs/[jobId]`
- `/campaigns/[campaignId]/characters` and `/characters/[characterId]`
- `/campaigns/[campaignId]/npcs` and `/npcs/[npcId]`
- `/campaigns/[campaignId]/factions` and `/factions/[factionId]`
- `/campaigns/[campaignId]/places` and `/places/[placeId]`
- `/campaigns/[campaignId]/episodes` and `/episodes/[episodeId]`
- `/campaigns/[campaignId]/notes` and `/notes/[noteId]`
- `/campaigns/[campaignId]/members`
- `/campaigns/[campaignId]/settings`

## Verification Gate

From clean `.next` and `.next-deploy` directories, run `npm test`, focused Playwright tests, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build -- --webpack`, `RUN_LOCAL_SUPABASE_TESTS=1 npm run test:rls` when local Supabase is available, and `git diff --check`. Validate direct links, refresh, back/forward, permissions, dirty-form warnings, AI/art flows, and representative desktop/mobile layouts.
