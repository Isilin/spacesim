import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (chantier 5.3) : lance sa propre pile serveur+web sur une base SQLite en
 * mémoire (`SPACESIM_DB=:memory:`), isolée de `spacesim.db` utilisé en dev —
 * chaque run démarre un univers neuf, jamais de pollution d'une partie réelle.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      'sh -c "(cd ../.. && SPACESIM_DB=:memory: pnpm --filter @spacesim/server dev) & pnpm exec vite --host 127.0.0.1"',
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
