import { MAX_CATCHUP_TICKS, TICK_MS } from "@spacesim/shared";
import { beforeAll, bench, describe } from "vite-plus/test";
import { db, schema } from "../db/index.js";
import { GameEngine } from "../game.js";

/**
 * Mesure le risque réel identifié en 27.6 : le rattrapage synchrone au boot
 * (`GameEngine.catchUp()`, appelé une fois depuis `runtime/boot.ts`), pas le régime
 * stationnaire (couvert par 27.7). `devFastForward` recule `lastTickAt` d'un delta FIXE puis
 * rejoue exactement ce delta en ticks (chantier 44), si bien que `lastTickAt` revient à sa
 * valeur d'entrée : chaque itération rejoue les mêmes 17 280 ticks, sans reset manuel.
 *
 * L'entête disait auparavant que l'horloge revenait « à ~maintenant » parce que le rattrapage
 * consommait aussi le temps réel. Le chiffre ne change pas — le plafond `MAX_CATCHUP_TICKS`
 * écrêtait déjà cette dérive ici — mais la raison, si.
 *
 * **La population PNJ fait partie du montage depuis le chantier 43.5, et c'est le sujet.**
 * Ce bench partait d'un `loadOrBootstrap()` nu : un empire, aucun PNJ, aucune économie qui
 * tourne. Il rendait 2,9 s pour 24 h simulées — un chiffre rassurant qui ne décrivait
 * AUCUNE configuration réelle, puisque `apps/server/src/index.ts` appelle
 * `ensureNpcPopulation()` juste après le boot, à chaque démarrage. Le pilote économique PNJ
 * publie des contrats, arbitre des prix et fait voyager des convois à chaque tick : c'est
 * lui qui remplit un tick, et il manquait à la mesure.
 *
 * Le chantier 48 est redescendu en vitest 4.1 — la version que Vite+ embarque —, donc le
 * `bench()` de portée module revient, avec `time`, `iterations` et les `warmup*` en TROISIÈME
 * argument. Le piège que cette entête signalait avant le chantier 46 revient avec lui : un
 * hook déclaré DANS le `describe` ne s'appliquerait pas aux benches, et le montage ne
 * tournerait jamais — un bench qui ne mesure rien passe pour vert. Le `beforeAll` est donc au
 * niveau du FICHIER, et doit y rester.
 */
let engine: GameEngine;

beforeAll(async () => {
  await db.delete(schema.games);
  await db.delete(schema.players);
  engine = await GameEngine.loadOrBootstrap();
  engine.ensureNpcPopulation();
});

describe("rattrapage au boot", () => {
  bench(
    `catchUp() sur ${MAX_CATCHUP_TICKS} ticks (24h simulées, TICK_MS=${TICK_MS}), PNJ compris`,
    () => {
      engine.devFastForward(24 * 3600);
    },
    { time: 0, iterations: 3, warmupTime: 0, warmupIterations: 0 },
  );
});
