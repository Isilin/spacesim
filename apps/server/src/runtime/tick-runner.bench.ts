import { MAX_CATCHUP_TICKS, TICK_MS } from "@spacesim/shared";
import { beforeAll, describe, test } from "vitest";
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
 * Vitest 5 a supprimé le `bench()` de portée module : un benchmark s'enregistre désormais
 * depuis le contexte d'un `test()` ordinaire et se déclenche par `.run()`. Le piège que
 * cette entête signalait — un hook de `describe` qui ne s'appliquait pas aux benches, donc
 * un montage qui ne tournait jamais — disparaît avec lui : les hooks valent ici ce qu'ils
 * valent pour n'importe quel test. Le `beforeAll` reste au niveau du FICHIER parce que le
 * montage doit tourner une fois, pas parce qu'il le faut.
 */
let engine: GameEngine;

beforeAll(async () => {
  await db.delete(schema.games);
  await db.delete(schema.players);
  engine = await GameEngine.loadOrBootstrap();
  engine.ensureNpcPopulation();
});

describe("rattrapage au boot", () => {
  test(`catchUp() sur ${MAX_CATCHUP_TICKS} ticks (24h simulées), PNJ compris`, async ({
    bench,
  }) => {
    // `time`, `iterations` et les `warmup*` sont des options d'EXÉCUTION en vitest 5 :
    // elles passent à `.run()`, le deuxième argument de `bench()` ne portant plus que les
    // hooks de cycle de vie du benchmark.
    await bench(
      `catchUp() sur ${MAX_CATCHUP_TICKS} ticks (24h simulées, TICK_MS=${TICK_MS}), PNJ compris`,
      () => {
        engine.devFastForward(24 * 3600);
      },
    ).run({ time: 0, iterations: 3, warmupTime: 0, warmupIterations: 0 });
  });
});
