import { defineConfig } from "vite-plus";

/**
 * Simulation pure : environnement node, aucun montage. Ce paquet n'avait pas de config —
 * les défauts suffisaient tant qu'il tournait seul dans son propre processus vitest.
 *
 * Le chantier 48 réunit les six paquets en projets d'un seul runner, qui partagent un pool
 * de workers. `universe.test.ts` génère l'univers complet : son test le plus lourd tient en
 * 2,93 s mesuré seul, soit deux secondes de marge sous le défaut de 5 s — marge que la
 * contention mange. C'est la même raison qui a porté `apps/server` à 30 s au chantier 37 :
 * un test qui échoue une fois sur trois ne prouve plus rien, et la contention n'est pas ce
 * que ce test mesure.
 */
export default defineConfig({
  test: {
    testTimeout: 15_000,
  },
});
