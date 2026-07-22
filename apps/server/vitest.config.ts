import { defineConfig } from "vitest/config";

// Tests moteur : DB SQLite en mémoire, jamais le fichier de partie réel.
// `env` est appliqué avant l'import des modules de test, donc avant que
// `src/db/index.ts` n'ouvre la connexion (il lit `SPACESIM_DB` au chargement).
export default defineConfig({
  test: {
    env: {
      SPACESIM_DB: ":memory:",
      NODE_ENV: "test",
    },
  },
});
