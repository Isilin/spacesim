import { defineConfig } from "vite-plus";

// Tests moteur : DB SQLite en mémoire, jamais le fichier de partie réel.
// `env` est appliqué avant l'import des modules de test, donc avant que
// `src/db/index.ts` n'ouvre la connexion (il lit `SPACESIM_DB` au chargement).
// `setupFiles` applique les migrations une fois par fichier isolé (chantier 20.1 :
// `db/index.ts` ne les lance plus automatiquement à l'import).
export default defineConfig({
  test: {
    env: {
      SPACESIM_DB: ":memory:",
      // Univers déterministe : la seed décide du nombre de sauts entre colonies, donc du
      // carburant et des frais qu'un test budgète. Tirée au hasard, elle faisait passer ou
      // échouer les tests de convoi selon l'univers du jour.
      SPACESIM_SEED: "test-univers",
      NODE_ENV: "test",
    },
    setupFiles: ["./src/test-setup.ts"],
    // Un bootstrap de test grave l'univers complet dans PGlite : quatre galaxies, soit
    // ~5 900 systèmes et ~24 000 corps depuis le chantier 37 (contre ~40 et ~290 avant).
    // Le défaut de 5 s tenait pour l'ancien volume ; sous la contention des workers, le
    // nouveau le dépasse par intermittence — et un test qui échoue une fois sur trois ne
    // prouve plus rien.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
