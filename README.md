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

The cockpit reads campaign records from Supabase. It does not seed demo jobs, characters, NPCs, factions, notes, episodes, or members in the browser. Empty collections render empty states, and selecting a campaign from `/campaigns` opens it at `/?campaignId=...`. The authenticated shell includes sign-out controls in both the cockpit and campaign selector.

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
3. Apply `supabase/migrations/0001_initial.sql` through `0007_campaign_ai_settings.sql` in order through the Supabase SQL editor or the linked Supabase CLI.
4. In Supabase Auth, add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
5. Set `NEXT_PUBLIC_APP_URL` to the deployed origin when deploying.

The migration creates campaign membership, role-aware RLS, GM-only notes in private tables, one active player vote per campaign, join-link redemption, episode promotion, and a private `campaign-art` storage bucket. Campaign creation and membership redemption use security-definer functions so a client cannot grant itself access by inserting rows directly.

Accounts are open to anyone. Local Auth is configured for email/password signup with email confirmation disabled, so a successful signup immediately creates a session without SMTP setup. A new account can create a campaign and is automatically made its GM; a campaign join link is only required to enter an existing campaign as a player. Display names are stored per campaign membership, so one account can use a different name in each campaign.

For a hosted Supabase project, disable **Confirm email** under Auth settings before using this same immediate-session signup flow. Add the deployed `/auth/callback` URL to the allowed redirect URLs even though password authentication does not require the callback route.

### Account recovery

The email address belongs to the Auth account in `auth.users`; `public.profiles` stores application data for that account. Deleting a profile does not make the email available for a new signup. Use **Reset password** on the sign-in page to recover an existing account. To permanently remove an account and make its email available again, delete the user from Supabase Auth, not only from `public.profiles`.

## OpenRouter AI setup

Set `OPENROUTER_API_KEY` in the server environment to enable the GM-only routes:

- `POST /api/ai/mission`
- `POST /api/ai/npc`
- `POST /api/ai/faction`
- `POST /api/ai/image`

The defaults are configured with `OPENROUTER_TEXT_MODEL` and `OPENROUTER_IMAGE_MODEL`. `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` are optional attribution headers. GMs can choose a compatible model per generation from the live OpenRouter catalog returned by `GET /api/ai/models`; arbitrary browser-supplied model IDs are rejected server-side. The catalog supports text/image capability filtering and popularity or price sorting, while discovery failures use the last verified catalog when available.

Campaign-level model access is managed from the GM-only **Campaign settings** view in the dashboard. New campaigns, and campaigns without a saved AI settings row, start with no models selected. GMs can add compatible text and image models from the searchable, sortable catalog, remove them from the selected lists, and save the campaign allowlist. At least one structured-text model and one image model must be selected before saving. The server enforces the same allowlist for every generation request.

Text choices are limited to models advertising structured outputs and not advertising image output. Image choices are limited to models advertising image output, and drafts are normalized with their returned media type. Mission, NPC, and faction responses are schema-validated and require GM review before applying them to an editor. Jobs can retain a suggested NPC or faction giver and create that giver inline without losing the unfinished job draft. Image drafts are reviewed and approved before the selected asset path is saved to a campaign record. The prototype does not impose generation-count limits; OpenRouter or the selected provider may still enforce its own limits. Successful or failed generations retain provider, model, usage, cost when supplied, and a prompt hash in `ai_generation_runs`; raw prompts and generated image data are not stored there. Keep the API key server-only.

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

The interface uses a synthwave starship-terminal visual language. Persistence covers job-board voting, campaign notes, characters/NPCs/factions, episode promotion, image uploads, and review-before-save AI image drafts.
