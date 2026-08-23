import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

const baseURL = "http://127.0.0.1:3100";
const loadedEnv = loadEnv("test", process.cwd(), "");
const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? loadedEnv.NEXT_PUBLIC_SUPABASE_URL;
const configuredPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? loadedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const isLoopbackSupabase = (() => {
  try {
    return new URL(configuredSupabaseUrl ?? "").hostname === "127.0.0.1";
  } catch {
    return false;
  }
})();
const localSupabaseUrl = isLoopbackSupabase ? configuredSupabaseUrl : "http://127.0.0.1:54321";
const localPublishableKey = isLoopbackSupabase ? configuredPublishableKey ?? "local-e2e-placeholder" : "local-e2e-placeholder";
const authFile = path.resolve("playwright/.auth/gm.json");

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: authFile },
    },
  ],
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localPublishableKey,
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseUrl,
      NETLIFY: "",
      PLAYWRIGHT_SERVER: "1",
    },
  },
});