import { defineConfig } from "vite-plus";

/**
 * Config du workspace (chantier 48). Les six paquets qui portent des tests tournaient
 * jusqu'ici dans six processus vitest indépendants, lancés par `pnpm -r test` : aucun
 * rapport commun, et `packages/i18n-config` — sans script `test` — était sauté SANS que
 * rien ne le signale. Les déclarer en projets rend l'absence visible.
 *
 * Chaque paquet garde sa propre config dans son `vite.config.ts` : environnement,
 * `setupFiles`, `env` et délais restent là où ils décrivent quelque chose.
 */
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    // `packages/i18n-config` n'a aucun test : il est désormais listé, et vert, plutôt
    // qu'invisible.
    passWithNoTests: true,
    // vitest 5 activait `clearMocks` par défaut ; la 4.1 embarquée par Vite+ ne le fait
    // pas. Le poser explicitement garde le comportement des dix fichiers qui utilisent
    // `vi.fn`/`vi.spyOn` — sans cette ligne, la descente de majeure changerait ce que
    // mesurent les suites, en silence.
    clearMocks: true,
  },
});
