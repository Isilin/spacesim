import { defineConfig } from "orval";

/**
 * Génère un client TypeScript typé (hooks TanStack Query) depuis le spec OpenAPI émis
 * par le serveur (chantier 27.8, GET /documentation/json) — remplace l'écriture manuelle
 * de formes de réponse et de hooks. Nécessite un serveur en cours d'exécution au moment
 * de la génération (voir scripts/generate-api.mjs, appelé par `pnpm api:generate`) —
 * même contrainte que `drizzle-kit generate` (DB vivante), pas une règle nouvelle.
 * Code généré committé dans le repo, régénéré via un script explicite quand l'API change.
 */
export default defineConfig({
  admin: {
    input: {
      target: "http://127.0.0.1:3001/documentation/json",
    },
    output: {
      mode: "single",
      target: "src/api/generated/admin.ts",
      client: "react-query",
      httpClient: "fetch",
      override: {
        mutator: {
          path: "./src/api/mutator.ts",
          name: "customFetch",
        },
      },
    },
  },
});
