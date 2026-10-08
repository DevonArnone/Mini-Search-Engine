import { defineConfig, devices } from "@playwright/test";

import { FIXTURE_INDEX_DIR } from "./tests/e2e/fixture-index";

const PORT = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/fixture-index.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // The real native engine over a small fixture index. No database is
    // assumed, so database-backed surfaces render their unavailable states.
    command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    env: {
      ...process.env,
      SEARCH_BACKEND: "native",
      SEARCH_INDEX_DIR: FIXTURE_INDEX_DIR,
      SEARCH_DEMO_MODE: "false",
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:1/unused",
      DATABASE_TIMEOUT_MS: "800",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${PORT}`,
  },
});
