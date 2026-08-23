# Browser acceptance tests

Playwright tests run only against the local Next.js server at `http://127.0.0.1:3100`. The test server overrides the public Supabase URL to the local Supabase API at `http://127.0.0.1:54321`; tests must never use hosted Supabase or Netlify.

## Local auth boundary

Browser journeys that require a signed-in user need local Supabase running and deterministic local accounts/campaign data. Store authenticated GM and player sessions as Playwright storage-state files created from that local setup. Do not commit storage-state files, access tokens, service-role keys, or hosted credentials. Keep unauthenticated tests limited to behavior that does not need credentials; do not add brittle authentication tests that depend on real accounts.

## Running the authenticated suite

Install the browser once, then start the loopback Supabase stack before running Playwright:

```powershell
npx playwright install chromium
supabase start
npm run test:e2e
```

The setup project provisions or reuses the local GM account `star-board-playwright-gm@local.test`, creates the campaign named `Star Board Playwright verification`, signs in through the real login form, and writes `playwright/.auth/gm.json` plus `playwright/.auth/gm-campaign.json`. Both files are ignored. Override `PLAYWRIGHT_GM_EMAIL`, `PLAYWRIGHT_GM_PASSWORD`, or `PLAYWRIGHT_CAMPAIGN_NAME` when running against a disposable local dataset. The helper rejects non-loopback Supabase URLs.

## First required journeys

Add focused, local-only acceptance coverage for:

1. authentication redirects that preserve the `next` destination;
2. campaign deep links and browser refresh;
3. browser back and forward navigation;
4. GM, player, and ownership permission visibility;
5. dirty-form warnings for internal navigation and unload; and
6. mobile campaign navigation.

The routing migration changes the refresh and history contracts intentionally, so characterize those as migration acceptance tests rather than forcing legacy SPA behavior. Keep tests scoped to stable user journeys and local data setup.