# Browser acceptance tests

Playwright tests run only against the local Next.js server at `http://127.0.0.1:3100`. The test server overrides the public Supabase URL to the local Supabase API at `http://127.0.0.1:55421`; tests must never use hosted Supabase or Netlify.

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

### Campaign library fixtures

The System library journeys additionally require the guarded fixture environment
shown in the [root README's RLS instructions](../../README.md): the local Auth
service key, explicit database container and confirmed database port. Set those
values in the same PowerShell process as `npm run test:e2e`. They are used only
for temporary local campaign owners, members, editor grants and imported
metadata fixtures. Tests never change a real account's membership or editor
access. No production table grants or existing permissions are changed.
Do not persist/print the service key or use a hosted URL.

Run the focused journeys with:

```powershell
npx playwright test library-access.spec.ts system-library.spec.ts reference-selections.spec.ts --project=chromium --workers=1
```

Coverage includes campaign-scoped reference revisions, owner and member-editor
permissions, isolation between campaigns, member-only grant/revoke controls,
browser history, legacy-link redirects, one persistent campaign shell,
name-only browse lists, sidebar dirty navigation, desktop/mobile overflow,
aligned NPC/character inputs with wrapped reference guidance, selected references
and lookup errors, consistent NPC AI workspace input spacing,
independently persisted opt-ins under Library > Generation context, and inline enemy
trait search in manual and AI workflows, including generation requests and private
ancestry/trait bindings. Tests
remove their temporary records and restore campaign settings.

## First required journeys

Add focused, local-only acceptance coverage for:

1. authentication redirects that preserve the `next` destination;
2. campaign deep links and browser refresh;
3. browser back and forward navigation;
4. GM, player, and ownership permission visibility;
5. dirty-form warnings for internal navigation and unload; and
6. mobile campaign navigation.

The routing migration changes the refresh and history contracts intentionally, so characterize those as migration acceptance tests rather than forcing legacy SPA behavior. Keep tests scoped to stable user journeys and local data setup.