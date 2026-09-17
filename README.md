# Star Board

Star Board is a persistent Starfinder 2e campaign operations console for GMs and players. Supabase provides email/password accounts, campaign membership, role-aware persistence, and invite links for joining existing campaigns.

## Local development

1. Install Node.js 20 or newer.
2. Install dependencies:

	```bash
	npm install
	```

3. Copy `.env.example` to `.env.local`.
4. Leave the environment values empty to use the local cockpit, or add Supabase credentials to enable authentication and persistence.
5. Start the development server:

	```bash
	npm run dev
	```

6. Open `http://localhost:3000`. Unauthenticated visitors see sign-in and account-creation actions; authenticated users without a selected campaign are sent to `/campaigns`.

The cockpit reads campaign records from Supabase. It does not seed demo jobs, characters, NPCs, factions, Places, notes, episodes, or members in the browser. Empty collections render empty states, and selecting a campaign from `/campaigns` opens its canonical `/campaigns/[campaignId]` route. The root route still redirects legacy `/?campaignId=...` links to that canonical destination. The authenticated shell includes sign-out controls in both the cockpit and campaign selector.

## Supabase setup

### Local Supabase

From the repository root:

```bash
supabase start
supabase status
supabase db push --local
```

Set these values in `.env.local` using the values printed by `supabase status`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The local dashboard is available at `http://127.0.0.1:54323`. On Windows, refresh the terminal after installing the CLI. If PowerShell still cannot resolve `supabase`, run the Scoop shim directly with `& "$env:USERPROFILE\\scoop\\shims\\supabase.exe"`.

`supabase db reset --local` is destructive: it recreates the local database from the migrations and `supabase/seed.sql`. Use `supabase db push --local` for a non-destructive migration update.

### Hosted Supabase

1. Create a Supabase project.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. Apply `supabase/migrations/0001_initial.sql` through `0027_visual_style_save_previews.sql` in order through the Supabase SQL editor or the linked Supabase CLI.
4. In Supabase Auth, add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
5. Set `NEXT_PUBLIC_APP_URL` to the deployed origin when deploying.

### Netlify image generation

Netlify standard functions can time out while OpenRouter is rendering an image. The image route automatically queues generation on Netlify's background function and the art studio polls for the review draft. The background function is `generate-image-background` and can run for up to 15 minutes. Jobs record `status_updated_at` and have bounded lifecycle deadlines: a worker must claim a pending job within four minutes, provider work has a 12-minute timeout, and running jobs expire after 14 minutes. The browser gives each status request a 10-second timeout and stops after repeated transient failures instead of spinning indefinitely.

Set these server-only values in the Netlify site environment:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the Supabase project URL and publishable key, available to the Functions scope as well as the build.
- `SUPABASE_SECRET_KEY`: the Supabase secret key. Never expose this as a `NEXT_PUBLIC_` variable.
- `CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS`: the versioned JSON keyring used to encrypt campaign-owned OpenRouter keys.
- `CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID`: the key ID used for new credentials and automatic rotation of old ciphertext.

`SUPABASE_SECRET_KEY`, `CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS`, and `CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID` must be available to the Netlify Functions scope, not only to the build environment. Changing a function variable requires a new deploy. The deploy summary should list exactly one `generate-image-background` function with background invocation mode. Worker logs and the matching `ai_generation_runs` row distinguish a job that was never claimed (`pending`), a provider or storage failure (`failed`), and a completed review draft (`complete`).

Deployed Netlify requests always use the background path even if a stale `NETLIFY_IMAGE_GENERATION=sync` variable is present. Runtime request metadata identifies Netlify when build-only metadata is unavailable, and the worker is dispatched through the incoming deploy origin so Deploy Previews remain isolated from production. Set `NETLIFY_IMAGE_GENERATION=background` to force the queue mode in another deployment environment; leave it as `sync` for local synchronous testing. Apply migrations `0012_async_image_generation.sql` and `0022_ai_image_job_lifecycle.sql` before using the deployed art studio.

### Netlify enemy generation

The GM enemy route keeps local generation synchronous, but queues full structured stat-block generation on Netlify so large responses are not lost to the synchronous request limit. The `generate-enemy-background` function validates the result, stores the private draft in `ai_generation_runs`, and the enemy editor polls `/api/ai/enemy/[generationRunId]` until the review candidate is ready. Apply `0023_async_enemy_generation.sql` and make `SUPABASE_SECRET_KEY` available to the Netlify Functions scope before using this deployed path. Generation never saves or overwrites an enemy until the GM applies the reviewed draft.

The migrations create campaign membership, role-aware RLS, GM-only notes in private tables, one active player vote per campaign, join-link redemption, episode promotion, a private `campaign-art` storage bucket, the genre-neutral Places archive, the campaign-scoped Enemies archive, faction player/GM notes, and optional campaign-scoped NPC faction membership. Places form an arbitrary-depth tree through `parent_place_id`; sibling names are unique within a campaign, cycles are rejected in PostgreSQL, deleting a parent promotes children to roots, and deleting a Place clears primary-place links on NPCs, factions, jobs, and episodes. Enemy mechanics, source provenance, and GM notes remain in GM-only detail rows; unrevealed enemy artwork is blocked from player Storage reads by an exact `enemies.art_path` reference and reveal check rather than a filename convention. Unattached background-generated image objects remain private to their requesting GM and are removed during retention when they are no longer referenced. Campaign creation and membership redemption use security-definer functions so a client cannot grant itself access by inserting rows directly.

Accounts are open to anyone. Local Auth is configured for email/password signup with email confirmation disabled, so a successful signup immediately creates a session without SMTP setup. A new account can create a campaign and is automatically made its GM; a campaign join link is only required to enter an existing campaign as a player. Display names are stored per campaign membership, so one account can use a different name in each campaign.

For a hosted Supabase project, disable **Confirm email** under Auth settings before using this same immediate-session signup flow. Add the deployed `/auth/callback` URL to the allowed redirect URLs even though password authentication does not require the callback route.

### Account recovery

The email address belongs to the Auth account in `auth.users`; `public.profiles` stores application data for that account. Deleting a profile does not make the email available for a new signup. Use **Reset password** on the sign-in page to recover an existing account. To permanently remove an account and make its email available again, delete the user from Supabase Auth, not only from `public.profiles`.

## OpenRouter AI setup

AI requests use one OpenRouter key connected to each campaign. Star Board does not use an app-wide OpenRouter key, does not ask users to paste key material into the browser, and does not fund a silent fallback when a campaign has no verified key.

Set these server-side values:

- `SUPABASE_SECRET_KEY`: used for OAuth state signing and privileged background-worker database access.
- `CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS`: a JSON object whose values are base64-encoded 32-byte AES keys, for example `{"key-2026-01":"base64-encoded-32-byte-key"}`.
- `CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID`: one key ID present in that JSON object.
- `OPENROUTER_TEXT_MODEL` and `OPENROUTER_IMAGE_MODEL`: the default model IDs used when a campaign has not selected another enabled model.
- `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME`: optional attribution headers sent to OpenRouter.

Keep the encryption keyring and Supabase secret in the server or Netlify Functions scope. Never use `NEXT_PUBLIC_` names for them. `NEXT_PUBLIC_APP_URL` must be the deployed origin in production; it is used to build the OAuth callback URL, and that callback URL must be allowed in the OpenRouter application configuration.

GMs connect a campaign key from Campaign settings. The connection uses OpenRouter OAuth with PKCE S256: Star Board receives a short-lived, single-use authorization code, exchanges it server-side, verifies the returned key, and stores only encrypted key material plus safe metadata. The browser receives an authorization URL, never the key, OAuth code, or PKCE verifier.

The connected GM or campaign creator can refresh provider metadata, reconnect, change player access, or disconnect the local connection. Disconnecting deletes Star Board's encrypted credential and stops new requests; it does not revoke the provider-side OpenRouter key. Use the owner controls link or OpenRouter's dashboard to revoke that key. Reconnecting resets player AI access off so a replacement key is not silently shared with players.

Player character assistance remains disabled unless a GM explicitly enables the player opt-in. The server and database policies enforce that players can use only the existing character-assistance path; GM text, image, enemy, mission, NPC, faction, Place, model-management, and campaign-settings routes remain GM-only.

### Campaign AI routes

- `POST /api/ai/mission`
- `POST /api/ai/npc`
- `POST /api/ai/faction`
- `POST /api/ai/place`
- `POST /api/ai/enemy`
- `POST /api/ai/enemy/brief`
- `POST /api/ai/image`

GMs can choose compatible models from the live OpenRouter catalog, and campaign settings enforce the saved model allowlist for every generation request. When provider discovery is unavailable, settings can show a read-only local fallback catalog; changing preferences still requires a verified campaign key.

Mission, NPC, faction, Place, enemy, and image responses are schema-validated. Enemy records support complete structured stat-block drafts and a separate spoiler-safe player brief draft. All AI output remains review-before-save. Image drafts are reviewed and approved before the selected asset is saved to a campaign record; generated approvals persist the originating prompt and provider, while manual uploads clear stale generation provenance. Provider failures preserve their HTTP status and safe request ID in the response, while bounded diagnostics are written to server logs without storing raw prompts or generated image data. AI usage is tracked by token and provider metadata, but generation-count quotas are not enforced. Keep the API key server-only.

### Key rotation and compromise boundary

To rotate the application encryption key, add a new key ID and base64-encoded 32-byte value to `CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS`, set `CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID` to that ID, and deploy. Existing credentials remain decryptable with their stored key ID and are re-encrypted with the active key after a successful request. Keep old keys until every stored row has rotated, then remove them in a later deploy. Do not overwrite an old key value under the same ID.

The credential table is service-role-only. Campaign rows contain ciphertext, initialization vectors, authentication tags, key IDs, hashes, safe provider metadata, and connector identity; raw OpenRouter keys are not returned to clients or written to jobs and audit records. A fully compromised application runtime that can read both the database and the active keyring can decrypt credentials, so revoke affected OpenRouter keys at the provider and rotate the application keyring after a server compromise.

### Enemies archive and Archives of Nethys imports

The Enemies archive is available at `/campaigns/[campaignId]/enemies`. GMs can create or edit campaign-scoped enemy records, review complete AI stat-block drafts, and reveal only the public name, approved artwork, and player-safe description. Players never receive enemy mechanics, tactics, weaknesses, spells, source snapshots, or GM notes. A GM can preview one creature URL from Archives of Nethys before applying it to the editor; supported URLs must use HTTPS, the exact `2e.aonsrd.com` host, and the `/creatures/{numeric-id}-{slug}` path. Fresh server-side fetches verify the final redirect target, embedded creature identity, canonical URL, parsed source hash, and reviewed payload before an AoN record is created or refreshed. Raw HTML and source-hosted images are not persisted, source snapshots must remain internally consistent with the saved record, and source refreshes require an explicit review and save against the currently loaded enemy revision.

### AI audit retention

`netlify/functions/ai-generation-retention.ts` runs once per day at `03:00 UTC` on published Netlify deploys. It uses the server-only `SUPABASE_SECRET_KEY` to delete `ai_generation_runs` metadata older than 90 days. It is a scheduled Netlify function, not a browser-facing Next.js route, and it does not store prompts or generated output.

Production scheduling requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the Netlify function/runtime environment. For a local smoke invocation, run `netlify dev` and invoke `ai-generation-retention` with the Netlify CLI. The one-off SQL fallback is retained at `supabase/snippets/ai-generation-retention.sql`.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The database-backed RLS suite is opt-in and targets only the local Supabase instance. Start local Supabase first, then run this in PowerShell:

```powershell
$env:RUN_LOCAL_SUPABASE_TESTS = "1"
npm run test:rls
```

The suite creates or signs into two local test accounts, creates a temporary campaign, and removes that campaign through the GM policy when it finishes. It is guarded against non-loopback Supabase URLs.

## Product direction

The interface uses a synthwave starship-terminal visual language. Persistence covers job-board voting, campaign notes, characters/NPCs/factions, faction player/GM notes, optional NPC faction membership, the arbitrary-depth Places archive, the campaign-scoped Enemies archive, one primary Place link on NPCs/factions/jobs/episodes, episode promotion, image uploads, and review-before-save AI text, image, and source-import drafts.
