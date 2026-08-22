<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Star Board Project Guide

## Product and Stack

- Star Board is a persistent Starfinder 2e campaign operations console for GMs and players.
- The stack is Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase Auth/Postgres/Storage with RLS, Zod, Vitest, and Playwright. Netlify hosts the app and long-running background functions.
- Use Node.js 20 or newer and npm. Treat `package.json`, current source, and current migrations as authoritative when prose becomes stale.
- Read [README.md](README.md) for environment setup, local Supabase instructions, and provider configuration. Do not duplicate setup documentation here.
- The application is persistence-first. Do not add browser-side demo records or silent mock fallbacks for authenticated campaign data. Empty collections should render intentional empty states.

## Working in This Repository

- Start at the owning route, component, server helper, or nearest test. Follow established feature patterns before adding an abstraction or dependency.
- Keep changes narrow. Do not refactor adjacent features unless the requested behavior depends on that work.
- Treat the worktree as potentially dirty. Never reset, revert, overwrite, or clean unrelated user changes.
- Never edit generated output in `.next/`, `.next-deploy/`, `.next-playwright/`, `.netlify/`, or `next-env.d.ts`.
- Do not deploy, alter hosted environment variables, or push migrations to hosted Supabase without explicit authorization.

## Application Architecture

- Canonical campaign URLs live under `app/campaigns/[campaignId]/`. Preserve URL-addressable list and detail views, browser history, and direct-load behavior.
- `app/campaigns/[campaignId]/layout.tsx` and `components/campaign-shell/` own the persistent campaign shell. Feature routes must not mount a second sidebar, topbar, or legacy cockpit shell.
- Feature UI belongs in its domain folder under `components/`. Reusable primitives belong in `components/ui/`; shared Markdown behavior belongs in `components/markdown/`.
- API route handlers live under `app/api/`. Shared business logic, campaign access, storage, AI, Supabase clients, and validation belong under `lib/`; avoid duplicating them in route handlers or client components.
- Use Server Components by default. Add `"use client"` only where state, effects, event handlers, or browser APIs require it, and keep server-only modules out of the client graph.
- Netlify scheduled and background work belongs in `netlify/functions/`, not in browser-facing Next.js routes.

## Frontend and Tailwind

- Use Tailwind CSS 4 utilities as the default styling mechanism. Keep feature styles colocated in `className` values or established component-local class constants.
- Keep `@import "tailwindcss"` first in `app/globals.css`. That file is reserved for shared design tokens, document-level base/reset rules, and truly global keyframes. Do not add feature-specific selector blocks there.
- Reuse the existing CSS variables such as `--background`, `--ink`, `--muted`, `--line`, `--panel`, `--cyan`, `--pink`, `--amber`, and `--green`. Prefer a shared token over adding near-duplicate hard-coded colors.
- Reuse `components/ui/terminalStyles.ts` for repeated terminal labels, status dots, dividers, and accent treatments. Auth surfaces use `components/auth/authStyles.ts`. Extract another class constant only when it has real reuse or makes a complex state easier to audit.
- Keep Tailwind class names statically discoverable. For variants, use complete literal class strings in a typed map rather than interpolating fragments such as `text-${color}-500`.
- Preserve the synthwave starship-terminal language: dark operational surfaces, angular bordered panels, compact mono metadata, restrained cyan/pink/amber/green accents, and clear information hierarchy. Do not introduce generic rounded-card SaaS styling, one-color screens, or decorative effects that reduce legibility.
- Prefer existing layout and display primitives such as `PageLayout`, `SectionHeading`, `AppStatus`, `EmptyState`, and `VisualAsset` before creating near-duplicates.
- Build responsive behavior with Tailwind breakpoint and container utilities near the affected markup. Verify narrow mobile and desktop layouts; controls, labels, toolbars, and long campaign content must wrap without overlap or horizontal page overflow.
- Preserve explicit loading, empty, error, disabled, and permission-denied states. Mutations must expose pending state and prevent accidental duplicate submission.
- Use semantic HTML and keyboard-accessible controls. Preserve visible `focus-visible` treatment, provide accessible names for icon-only buttons, and use `lucide-react` instead of hand-authored SVGs when an icon exists.
- Respect player/GM information boundaries in the rendered UI. Hiding a control is not authorization; the server and RLS must enforce the same rule.

## Supabase, Auth, and API Boundaries

- Use `lib/supabase/browser.ts` only in client code, `lib/supabase/server.ts` in Server Components and route handlers, and `lib/supabase/service.ts` only for explicit privileged server or function work.
- Never expose `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, or other server credentials through `NEXT_PUBLIC_*`, client bundles, responses, logs, or fixtures. Access validated configuration through `lib/env.ts`.
- Scope every campaign record read and mutation to the campaign and authenticated membership. Preserve GM/player authorization and separate GM-only note storage; never rely on a client-supplied role.
- Campaign display names belong to `campaign_members`, not the global profile. One account may have a different display name in each campaign.
- Route handlers should follow the local sequence: parse input, validate with the schema in `lib/validation/`, authenticate/authorize with shared helpers, perform the query or RPC, and return the established JSON/error shape.
- Validate at trust boundaries with Zod. Keep cross-field and database integrity constraints in the owning layer; do not replace PostgreSQL/RLS guarantees with UI-only checks.
- RLS is part of the feature contract. Database changes must account for policies, authenticated table grants, indexes, constraints, cleanup behavior, generated TypeScript types when applicable, and tests.
- Add forward migrations under `supabase/migrations/`. Do not rewrite a migration that may already be applied. Validate against local Supabase first and never point destructive or integration commands at a hosted URL.

## AI and Campaign Art Invariants

- AI text and image generation is review-before-save. Generation returns a validated draft; only an explicit user action persists it to a campaign entity. Do not make generation mutate the target entity implicitly.
- Preserve route-specific membership/GM checks, campaign model allowlists, Zod request/response validation, provider status propagation, and bounded safe diagnostics.
- Do not persist raw prompts or generated image payloads in AI audit logs. Usage records may retain bounded provider metadata, request IDs, token counts, and statuses needed for operations.
- Campaign art lives in the private `campaign-art` bucket under campaign/user-scoped paths. Serve it with short-lived signed URLs and verify membership before upload, signing, or deletion.
- Preserve provenance: approved generated art carries its originating prompt/provider metadata; manual replacement or removal clears stale generated-art provenance.
- Preserve the asynchronous Netlify image path. The background function owns long-running provider work, the UI polls for a temporary review draft, and temporary objects are removed after approval when safe.

## Tests and Validation

- Use the narrowest meaningful test first, then broaden validation according to the change's risk.
- Unit and route tests live in `tests/` and run with `npm test`. Add focused regression coverage beside the closest existing pattern.
- Run `npm run typecheck` for TypeScript changes and `npm run lint` for source changes. Run `npm run build` when changing routes, framework configuration, server/client boundaries, or deployment behavior.
- Run `npm run test:e2e` for campaign shell/navigation, auth, route history, permission, or responsive workflow changes. Playwright uses local Supabase, `127.0.0.1:3100`, and `.next-playwright`.
- RLS tests are opt-in and local-only. Start local Supabase, confirm the URL is loopback, then run in PowerShell:

	```powershell
	$env:RUN_LOCAL_SUPABASE_TESTS = "1"
	npm run test:rls
	```

- Never weaken the loopback guards in E2E or RLS setup. These suites create and delete test data.
- When changing `vitest.config.mts`, preserve `...configDefaults.exclude`; replacing the defaults can make Vitest discover dependencies and generated output.
- For documentation-only edits, inspect the rendered structure/diff and run `git diff --check`; application suites are unnecessary unless the documentation change accompanies code.

## Deployment Constraints

- `middleware.ts` is intentionally retained even though Next.js warns that the convention is deprecated. The replacement `proxy.ts` has been incompatible with the current Netlify Windows bundle; do not migrate it merely to silence the warning.
- `netlify.toml` intentionally builds with webpack, copies `.next` to `.next-deploy`, and publishes that copy. Preserve this workaround unless a verified adapter upgrade removes the need.
- `@opentelemetry/api` is a production dependency required by the generated middleware bundle.
- Keep `.next-deploy/**`, `.next-playwright/**`, and `.netlify/**` ignored by lint and test discovery.
