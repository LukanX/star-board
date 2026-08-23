import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      ".netlify/**",
      ".next/**",
      ".next-deploy/**",
      ".next-playwright/**",
      "tests/e2e/**",
    ],
  },
});