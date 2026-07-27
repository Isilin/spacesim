import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // e2e/ est la suite Playwright (chantier 5.3) : specs `*.spec.ts` distinctes
    // des tests unitaires, jamais chargées par vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
