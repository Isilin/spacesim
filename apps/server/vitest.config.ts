import { defineConfig } from "vitest/config";

// Tests moteur : DB SQLite en mémoire, jamais le fichier de partie réel.
// `env` est appliqué avant l'import des modules de test, donc avant que
// `src/db/index.ts` n'ouvre la connexion (il lit `SPACESIM_DB` au chargement).
// `setupFiles` applique les migrations une fois par fichier isolé (chantier 20.1 :
// `db/index.ts` ne les lance plus automatiquement à l'import).
export default defineConfig({
  test: {
    env: {
      SPACESIM_DB: ":memory:",
      NODE_ENV: "test",
    },
    setupFiles: ["./src/test-setup.ts"],
  },
});
