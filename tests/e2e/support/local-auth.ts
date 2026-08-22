import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const loadedEnv = loadEnv("test", process.cwd(), "");

export type LocalE2eCredentials = {
  email: string;
  password: string;
};

export type LocalE2eCampaign = {
  campaignId: string;
  campaignName: string;
  credentials: LocalE2eCredentials;
};

function getEnvValue(name: string) {
  return process.env[name] ?? loadedEnv[name];
}

export function getLocalE2eCampaignName() {
  return process.env.PLAYWRIGHT_CAMPAIGN_NAME ?? "Star Board Playwright verification";
}

export function getLocalE2eCredentials(): LocalE2eCredentials {
  return {
    email: process.env.PLAYWRIGHT_GM_EMAIL ?? "star-board-playwright-gm@local.test",
    password: process.env.PLAYWRIGHT_GM_PASSWORD ?? "local-playwright-password-2026",
  };
}

export function getLocalE2eSupabaseConfig() {
  const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = getEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  let isLoopback = false;
  try {
    isLoopback = new URL(supabaseUrl ?? "").hostname === "127.0.0.1";
  } catch {
    isLoopback = false;
  }

  if (!isLoopback || !supabaseUrl || !publishableKey || publishableKey === "local-e2e-placeholder") {
    throw new Error("Playwright authenticated setup requires a running loopback Supabase stack and its publishable key. Start local Supabase and set NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before running npm run test:e2e.");
  }

  return { supabaseUrl, publishableKey };
}

function createLocalClient() {
  const { supabaseUrl, publishableKey } = getLocalE2eSupabaseConfig();
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function authenticate(client: SupabaseClient, credentials: LocalE2eCredentials) {
  const signedIn = await client.auth.signInWithPassword(credentials);

  if (!signedIn.error && signedIn.data.session) {
    return;
  }

  const signedUp = await client.auth.signUp(credentials);

  if (signedUp.error || !signedUp.data.session) {
    throw new Error(`Unable to authenticate the local Playwright GM: ${signedUp.error?.message ?? signedIn.error?.message ?? "no session returned"}`);
  }
}

export async function ensureLocalGmCampaign(): Promise<LocalE2eCampaign> {
  const credentials = getLocalE2eCredentials();
  const campaignName = getLocalE2eCampaignName();
  const client = createLocalClient();
  await authenticate(client, credentials);

  const existing = await client
    .from("campaigns")
    .select("id")
    .eq("name", campaignName)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Unable to find the local Playwright campaign: ${existing.error.message}`);
  }

  if (existing.data?.id) {
    return { campaignId: existing.data.id, campaignName, credentials };
  }

  const created = await client.rpc("create_campaign", {
    campaign_name: campaignName,
    campaign_description: "Deterministic campaign data for local Playwright acceptance tests.",
  });

  if (created.error || typeof created.data !== "string") {
    throw new Error(`Unable to create the local Playwright campaign: ${created.error?.message ?? "no campaign id returned"}`);
  }

  return { campaignId: created.data, campaignName, credentials };
}
