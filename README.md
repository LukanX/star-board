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

The cockpit reads campaign records from Supabase. It does not seed demo jobs, characters, NPCs, factions, Places, notes, episodes, or members in the browser. Empty collections render empty states, and selecting a campaign from `/campaigns` opens it at `/?campaignId=...`. The authenticated shell includes sign-out controls in both the cockpit and campaign selector.

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
3. Apply `supabase/migrations/0001_initial.sql` through `0011_fix_place_cycle_validation.sql` in order through the Supabase SQL editor or the linked Supabase CLI.
4. In Supabase Auth, add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
5. Set `NEXT_PUBLIC_APP_URL` to the deployed origin when deploying.

The migrations create campaign membership, role-aware RLS, GM-only notes in private tables, one active player vote per campaign, join-link redemption, episode promotion, a private `campaign-art` storage bucket, and the genre-neutral Places archive. Places form an arbitrary-depth tree through `parent_place_id`; sibling names are unique within a campaign, cycles are rejected in PostgreSQL, deleting a parent promotes children to roots, and deleting a Place clears primary-place links on NPCs, factions, jobs, and episodes. Campaign creation and membership redemption use security-definer functions so a client cannot grant itself access by inserting rows directly.

Accounts are open to anyone. Local Auth is configured for email/password signup with email confirmation disabled, so a successful signup immediately creates a session without SMTP setup. A new account can create a campaign and is automatically made its GM; a campaign join link is only required to enter an existing campaign as a player. Display names are stored per campaign membership, so one account can use a different name in each campaign.

For a hosted Supabase project, disable **Confirm email** under Auth settings before using this same immediate-session signup flow. Add the deployed `/auth/callback` URL to the allowed redirect URLs even though password authentication does not require the callback route.

### Account recovery

The email address belongs to the Auth account in `auth.users`; `public.profiles` stores application data for that account. Deleting a profile does not make the email available for a new signup. Use **Reset password** on the sign-in page to recover an existing account. To permanently remove an account and make its email available again, delete the user from Supabase Auth, not only from `public.profiles`.

## OpenRouter AI setup

Set `OPENROUTER_API_KEY` in the server environment to enable the GM-only routes:

- `POST /api/ai/mission`
- `POST /api/ai/npc`
- `POST /api/ai/faction`
- `POST /api/ai/place`
- `POST /api/ai/image`

Text and image models can be changed with `OPENROUTER_TEXT_MODEL` and `OPENROUTER_IMAGE_MODEL`. `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` are optional attribution headers. GMs can choose compatible models from the live OpenRouter catalog, and campaign settings enforce the saved model allowlist for every generation request.

Mission, NPC, faction, Place, and image responses are schema-validated. Place generation receives the selected parent hierarchy, but all AI output remains review-before-save. Image drafts are reviewed and approved before the selected asset is saved to a campaign record; generated approvals persist the originating prompt and provider, while manual uploads clear stale generation provenance. Provider failures preserve their HTTP status and safe request ID in the response, while bounded diagnostics are written to server logs without storing raw prompts or generated image data. AI usage is tracked by token and provider metadata, but generation-count quotas are not enforced. Keep the API key server-only.

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

The interface uses a synthwave starship-terminal visual language. Persistence covers job-board voting, campaign notes, characters/NPCs/factions, the arbitrary-depth Places archive, one primary Place link on NPCs/factions/jobs/episodes, episode promotion, image uploads, and review-before-save AI text and image drafts.
