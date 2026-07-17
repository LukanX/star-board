# Star Board

Star Board is a persistent Starfinder 2e campaign operations console for GMs and players. The current cockpit runs locally without credentials; Supabase and OpenAI turn it into a multi-user campaign workspace.

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

6. Open `http://localhost:3000` for the cockpit or `http://localhost:3000/login` for magic-link sign-in.

## Supabase setup

1. Create a Supabase project.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. Run `supabase/migrations/0001_initial.sql` in the Supabase SQL editor or through the Supabase CLI.
4. In Supabase Auth, add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
5. Set `NEXT_PUBLIC_APP_URL` to the deployed origin when deploying.

The migration creates campaign membership, role-aware RLS, GM-only notes in private tables, one active player vote per campaign, join-link redemption, episode promotion, and a private `campaign-art` storage bucket. Campaign creation and membership redemption use security-definer functions so a client cannot grant itself access by inserting rows directly.

## OpenAI setup

Set `OPENAI_API_KEY` to enable the GM-only routes:

- `POST /api/ai/mission`
- `POST /api/ai/npc`
- `POST /api/ai/image`

Text and image models can be changed with `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL`. AI responses are schema-validated before a future editor saves them to the campaign. Keep the API key server-only.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## Product direction

The interface uses a synthwave starship-terminal visual language. Planned persistence slices are job-board voting, campaign notes, characters/NPCs/factions, episode promotion, image uploads, and review-before-save AI editors.
